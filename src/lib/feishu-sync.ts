import crypto from 'crypto';
import { getDb } from '@/lib/db';
import {
  getFeishuDocBlocks,
  parseDocumentId,
  resolveDocxId,
  appendCompletionToFeishuDoc,
  updateFeishuDocBlockFormatted,
  blocksToMarkdown,
} from '@/lib/feishu';

function hashContent(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function blockPlainText(block: {
  block_type: number;
  text?: { elements: Array<{ text_run: { content: string } }> };
  heading1?: { elements: Array<{ text_run: { content: string } }> };
  heading2?: { elements: Array<{ text_run: { content: string } }> };
  heading3?: { elements: Array<{ text_run: { content: string } }> };
  bullet?: { elements: Array<{ text_run: { content: string } }> };
  ordered?: { elements: Array<{ text_run: { content: string } }> };
}): string {
  const elements =
    block.text?.elements ||
    block.heading1?.elements ||
    block.heading2?.elements ||
    block.heading3?.elements ||
    block.bullet?.elements ||
    block.ordered?.elements;
  if (!elements) return '';
  return elements.map((e) => e.text_run?.content || '').join('');
}

// Match stage name from H1 text to system stage names
function normalizeStageName(name: string): string {
  return name.replace(/^#+\s*/, '').trim();
}

function normalizeTaskName(name: string): string {
  return name.replace(/^[-*]\s*/, '').trim();
}

// ========== buildBlockMappings ==========
export function buildBlockMappings(
  ipId: number,
  documentId: string,
  blocks: Array<{
    block_id: string; block_type: number;
    text?: { elements: Array<{ text_run: { content: string } }> };
    heading1?: { elements: Array<{ text_run: { content: string } }> };
    heading2?: { elements: Array<{ text_run: { content: string } }> };
    heading3?: { elements: Array<{ text_run: { content: string } }> };
    bullet?: { elements: Array<{ text_run: { content: string } }> };
    ordered?: { elements: Array<{ text_run: { content: string } }> };
  }>,
): number {
  const db = getDb();

  // Get all tasks for this IP
  const tasks = db
    .prepare('SELECT id, stage_name, task_name FROM client_delivery_tasks WHERE client_id = ? ORDER BY sort_order')
    .all(ipId) as Array<{ id: number; stage_name: string; task_name: string }>;

  // Get stage names from templates
  const stages = db
    .prepare('SELECT DISTINCT stage_name FROM delivery_templates WHERE status = ? ORDER BY sort_order')
    .all('active') as Array<{ stage_name: string }>;

  const stageNames = new Set(stages.map((s) => normalizeStageName(s.stage_name)));

  // Clear existing mappings for this document
  db.prepare('DELETE FROM feishu_block_mappings WHERE document_id = ?').run(documentId);

  let currentStageName = '';
  let lastMappedTaskId: number | null = null;
  let mappedCount = 0;

  const insert = db.prepare(
    `INSERT OR REPLACE INTO feishu_block_mappings
     (ip_id, document_id, block_id, block_type, system_entity_type, system_entity_ref, content_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );

  for (const block of blocks) {
    const plainText = blockPlainText(block).trim();
    const hash = hashContent(plainText);

    // H1 — stage heading
    if (block.block_type === 3) {
      const stageName = normalizeStageName(plainText);
      if (stageNames.has(stageName)) {
        currentStageName = stageName;
        lastMappedTaskId = null;
        insert.run(ipId, documentId, block.block_id, 'stage_heading', 'stage', stageName, hash);
        mappedCount++;
      }
      continue;
    }

    // H2 — could be a completion header
    if (block.block_type === 4) {
      const match = plainText.match(/^【交付完成】(.*)$/);
      if (match) {
        insert.run(ipId, documentId, block.block_id, 'completion_header', 'task', '', hash);
        mappedCount++;
      }
      continue;
    }

    // Bullet / ordered list — task
    if (block.block_type === 13 || block.block_type === 14) {
      const taskName = normalizeTaskName(plainText);
      if (!taskName) continue;
      const task = tasks.find(
        (t) => t.stage_name === currentStageName && t.task_name === taskName,
      );
      if (task) {
        lastMappedTaskId = task.id;
        insert.run(ipId, documentId, block.block_id, 'task_bullet', 'task', String(task.id), hash);
        mappedCount++;
      } else {
        lastMappedTaskId = null;
      }
      continue;
    }

    // Text block — likely a "记录：" block following a task bullet
    if (block.block_type === 2) {
      if (lastMappedTaskId && plainText.startsWith('记录：')) {
        insert.run(
          ipId,
          documentId,
          block.block_id,
          'task_record',
          'task',
          String(lastMappedTaskId),
          hash,
        );
        mappedCount++;
      } else if (plainText === '') {
        // Separator / empty text block
        insert.run(ipId, documentId, block.block_id, 'separator', 'none', '', hash);
        mappedCount++;
      }
      continue;
    }
  }

  return mappedCount;
}

// ========== syncFeishuToSystem ==========
export async function syncFeishuToSystem(
  ipId: number,
  documentId: string,
  triggeredBy?: number,
): Promise<{
  success: boolean;
  changesDetected: number;
  changesApplied: number;
  details: Array<{ blockId: string; changeType: string; description: string }>;
  error?: string;
}> {
  const db = getDb();
  const details: Array<{ blockId: string; changeType: string; description: string }> = [];
  let changesDetected = 0;
  let changesApplied = 0;

  try {
    // Fetch current blocks
    const blocks = await getFeishuDocBlocks(documentId);
    if (!blocks.length) {
      return { success: false, changesDetected: 0, changesApplied: 0, details: [], error: '无法获取飞书文档内容' };
    }

    // Get existing mappings
    const mappings = db
      .prepare('SELECT * FROM feishu_block_mappings WHERE document_id = ?')
      .all(documentId) as Array<{
        id: number; ip_id: number; document_id: string; block_id: string;
        block_type: string; system_entity_type: string; system_entity_ref: string;
        content_hash: string;
      }>;
    const mappingByBlockId = new Map(mappings.map((m) => [m.block_id, m]));

    // Get tasks for this IP
    const tasks = db
      .prepare('SELECT * FROM client_delivery_tasks WHERE client_id = ?')
      .all(ipId) as Array<{
        id: number; stage_name: string; task_name: string; status: string;
        completion_note: string;
      }>;
    const taskById = new Map(tasks.map((t) => [t.id, t]));
    const taskByName = new Map(tasks.map((t) => [t.task_name, t]));

    // Get stages for this IP from templates
    const ip = db.prepare('SELECT product_type_id FROM ip WHERE id = ?').get(ipId) as {
      product_type_id: number | null;
    } | undefined;
    const stages = ip?.product_type_id
      ? (db.prepare(
          'SELECT DISTINCT stage_name FROM delivery_templates WHERE product_type_id = ? AND status = ? ORDER BY sort_order',
        ).all(ip.product_type_id, 'active') as Array<{ stage_name: string }>)
      : [];

    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

    // Phase 1: Scan all blocks
    let currentStageName = '';

    for (const block of blocks) {
      const plainText = blockPlainText(block).trim();
      const existingMapping = mappingByBlockId.get(block.block_id);

      // Track stage context
      if (block.block_type === 3) {
        const stageName = normalizeStageName(plainText);
        const matchedStage = stages.find((s) => normalizeStageName(s.stage_name) === stageName);
        if (matchedStage) currentStageName = matchedStage.stage_name;
        else currentStageName = stageName;

        // Check for heading text changes
        if (existingMapping && existingMapping.block_type === 'stage_heading') {
          const newHash = hashContent(plainText);
          if (newHash !== existingMapping.content_hash) {
            changesDetected++;
            // Update stage name in tasks
            const oldStageName = existingMapping.system_entity_ref;
            if (oldStageName !== currentStageName && currentStageName) {
              db.prepare(
                'UPDATE client_delivery_tasks SET stage_name = ? WHERE client_id = ? AND stage_name = ?',
              ).run(currentStageName, ipId, oldStageName);
              db.prepare(
                'UPDATE ip_stage_progress SET stage_name = ? WHERE ip_id = ? AND stage_name = ?',
              ).run(currentStageName, ipId, oldStageName);
              db.prepare(
                'UPDATE feishu_block_mappings SET content_hash = ?, last_synced_at = ? WHERE id = ?',
              ).run(newHash, now, existingMapping.id);
              changesApplied++;
              details.push({
                blockId: block.block_id,
                changeType: 'stage_renamed',
                description: `阶段名称变更：「${oldStageName}」→「${currentStageName}」`,
              });
            }
          }
        }
        continue;
      }

      // Check for task bullet text changes
      if (existingMapping && existingMapping.block_type === 'task_bullet') {
        const newHash = hashContent(plainText);
        if (newHash !== existingMapping.content_hash) {
          changesDetected++;
          const taskId = parseInt(existingMapping.system_entity_ref, 10);
          if (taskId) {
            const newTaskName = normalizeTaskName(plainText);
            db.prepare('UPDATE client_delivery_tasks SET task_name = ?, updated_at = ? WHERE id = ?').run(
              newTaskName,
              now,
              taskId,
            );
            db.prepare(
              'UPDATE feishu_block_mappings SET content_hash = ?, last_synced_at = ? WHERE id = ?',
            ).run(newHash, now, existingMapping.id);
            changesApplied++;
            details.push({
              blockId: block.block_id,
              changeType: 'task_renamed',
              description: `任务名称变更 →「${newTaskName}」`,
            });
          }
        }
        continue;
      }

      // Check for task_record text changes
      if (existingMapping && existingMapping.block_type === 'task_record') {
        const newHash = hashContent(plainText);
        if (newHash !== existingMapping.content_hash) {
          changesDetected++;
          const taskId = parseInt(existingMapping.system_entity_ref, 10);
          const task = taskId ? taskById.get(taskId) : undefined;
          if (task) {
            // Extract the note content (after "记录：")
            const noteContent = plainText.replace(/^记录：/, '').trim();
            if (noteContent) {
              const existingNote = task.completion_note || '';
              const feishuPrefix = `[飞书记录 ${now.slice(0, 10)}]`;
              // Only append if not already present
              if (!existingNote.includes(noteContent)) {
                const newNote = existingNote
                  ? `${existingNote}\n${feishuPrefix} ${noteContent}`
                  : `${feishuPrefix} ${noteContent}`;
                db.prepare(
                  'UPDATE client_delivery_tasks SET completion_note = ?, updated_at = ? WHERE id = ?',
                ).run(newNote, now, taskId);
              }
            }
            db.prepare(
              'UPDATE feishu_block_mappings SET content_hash = ?, last_synced_at = ? WHERE id = ?',
            ).run(newHash, now, existingMapping.id);
            changesApplied++;
            details.push({
              blockId: block.block_id,
              changeType: 'record_updated',
              description: `任务「${task.task_name}」的记录内容已从飞书同步`,
            });
          }
        }
        continue;
      }

      // Detect NEW completion headers (H2 with 【交付完成】 pattern, no existing mapping)
      if (block.block_type === 4 && !existingMapping) {
        const match = plainText.match(/^【交付完成】(.*)$/);
        if (match) {
          changesDetected++;
          const taskName = match[1].trim();
          const task = taskByName.get(taskName);
          if (task && task.status !== 'completed') {
            db.prepare(
              `UPDATE client_delivery_tasks
               SET status = 'completed', completed_at = ?, completion_note = '[从飞书同步] ' || COALESCE(completion_note, ''),
                   updated_at = ?
               WHERE id = ?`,
            ).run(now, now, task.id);
            // Insert mapping so we don't re-detect
            db.prepare(
              `INSERT OR REPLACE INTO feishu_block_mappings
               (ip_id, document_id, block_id, block_type, system_entity_type, system_entity_ref, content_hash, last_synced_at)
               VALUES (?, ?, ?, 'completion_header', 'task', ?, ?, ?)`,
            ).run(ipId, documentId, block.block_id, String(task.id), hashContent(plainText), now);
            // Log delivery action
            db.prepare(
              `INSERT INTO delivery_logs (client_id, task_id, operator_name, action_type, content, new_status, created_at)
               VALUES (?, ?, ?, 'feishu_sync_complete', ?, 'completed', ?)`,
            ).run(ipId, task.id, '飞书同步', `从飞书文档自动检测到完成记录`, now);
            changesApplied++;
            details.push({
              blockId: block.block_id,
              changeType: 'completion_detected',
              description: `检测到完成记录：「${taskName}」，已自动标记为完成`,
            });
          }
        }
      }
    }

    // Phase 2: Auto-complete stages where all tasks are done
    for (const stage of stages) {
      const stageTasks = tasks.filter((t) => t.stage_name === stage.stage_name);
      if (stageTasks.length === 0) continue;
      const allDone = stageTasks.every((t) => t.status === 'completed');
      if (!allDone) continue;

      const existingProgress = db
        .prepare('SELECT id FROM ip_stage_progress WHERE ip_id = ? AND stage_name = ? AND completed_at IS NOT NULL')
        .get(ipId, stage.stage_name);
      if (!existingProgress) {
        db.prepare(
          `INSERT INTO ip_stage_progress (ip_id, stage_name, completed_at)
           VALUES (?, ?, ?)
           ON CONFLICT(ip_id, stage_name) DO UPDATE SET completed_at = ?`,
        ).run(ipId, stage.stage_name, now, now);
        details.push({
          blockId: '',
          changeType: 'stage_auto_completed',
          description: `阶段「${stage.stage_name}」所有任务已完成，自动标记阶段为完成`,
        });
        changesApplied++;
      }
    }

    // Write sync log
    db.prepare(
      `INSERT INTO feishu_sync_log
       (ip_id, document_id, direction, trigger, changes_detected, changes_applied, details, status, triggered_by)
       VALUES (?, ?, 'feishu_to_system', 'manual', ?, ?, ?, 'success', ?)`,
    ).run(ipId, documentId, changesDetected, changesApplied, JSON.stringify(details), triggeredBy || null);

    return { success: true, changesDetected, changesApplied, details };
  } catch (e) {
    const errMsg = (e as Error).message;
    db.prepare(
      `INSERT INTO feishu_sync_log
       (ip_id, document_id, direction, trigger, changes_detected, changes_applied, details, status, error_message, triggered_by)
       VALUES (?, ?, 'feishu_to_system', 'manual', ?, ?, ?, 'error', ?, ?)`,
    ).run(ipId, documentId, changesDetected, changesApplied, JSON.stringify(details), errMsg, triggeredBy || null);
    return { success: false, changesDetected, changesApplied, details, error: errMsg };
  }
}

// ========== appendCompletionToFeishuDocTracked ==========
export async function appendCompletionToFeishuDocTracked(
  feishuDocUrl: string,
  taskName: string,
  completionDate: string,
  completedByName: string,
  completionNote: string,
  taskId: number,
  ipId: number,
): Promise<{ success: boolean; error?: string }> {
  try {
    const result = await appendCompletionToFeishuDoc(
      feishuDocUrl,
      taskName,
      completionDate,
      completedByName,
      completionNote,
    );
    if (!result.success) return result;

    // Re-fetch blocks to find the newly created ones and map them
    // 知识库（wiki）链接里的是节点 token，不是文档 ID，需要用库里记录的 document_id
    const db0 = getDb();
    const docRow = db0.prepare(
      "SELECT document_id FROM ip_feishu_docs WHERE ip_id = ? AND feishu_doc_url = ? LIMIT 1"
    ).get(ipId, feishuDocUrl) as { document_id: string } | undefined;
    const documentId = resolveDocxId(feishuDocUrl, docRow?.document_id);
    if (!documentId) return result;

    const blocks = await getFeishuDocBlocks(documentId);
    if (!blocks.length) return result;

    const db = getDb();
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

    // Find new H2 completion headers that aren't yet mapped
    const existingMappings = db
      .prepare('SELECT block_id FROM feishu_block_mappings WHERE document_id = ?')
      .all(documentId) as Array<{ block_id: string }>;
    const mappedBlockIds = new Set(existingMappings.map((m) => m.block_id));

    const insert = db.prepare(
      `INSERT OR IGNORE INTO feishu_block_mappings
       (ip_id, document_id, block_id, block_type, system_entity_type, system_entity_ref, content_hash, last_synced_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    // Map new blocks (look for the completion header and its child text blocks)
    let foundHeader = false;
    for (const block of blocks) {
      if (mappedBlockIds.has(block.block_id)) continue;
      const plainText = blockPlainText(block).trim();
      const hash = hashContent(plainText);

      if (!foundHeader && block.block_type === 4 && plainText.includes(`【交付完成】${taskName}`)) {
        foundHeader = true;
        insert.run(ipId, documentId, block.block_id, 'completion_header', 'task', String(taskId), hash, now);
      } else if (foundHeader && block.block_type === 2) {
        // Text blocks under the completion header
        insert.run(ipId, documentId, block.block_id, 'completion_detail', 'task', String(taskId), hash, now);
        if (plainText.includes('系统同步时间')) break; // Last block of our completion record
      }
    }

    return result;
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

// ========== syncSystemToFeishu ==========
// Push system content changes back to Feishu blocks
export async function syncSystemToFeishu(
  ipId: number,
  documentId: string,
  triggeredBy?: number,
): Promise<{
  success: boolean;
  changesDetected: number;
  changesApplied: number;
  details: Array<{ blockId: string; changeType: string; description: string }>;
  error?: string;
}> {
  const db = getDb();
  const details: Array<{ blockId: string; changeType: string; description: string }> = [];
  let changesDetected = 0;
  let changesApplied = 0;

  try {
    const blocks = await getFeishuDocBlocks(documentId);
    if (!blocks.length) {
      return { success: false, changesDetected: 0, changesApplied: 0, details: [], error: '无法获取飞书文档内容' };
    }

    const mappings = db
      .prepare('SELECT * FROM feishu_block_mappings WHERE document_id = ?')
      .all(documentId) as Array<{
        id: number; ip_id: number; document_id: string; block_id: string;
        block_type: string; system_entity_type: string; system_entity_ref: string;
        content_hash: string;
      }>;

    const blockMap = new Map(blocks.map(b => [b.block_id, b]));
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

    for (const mapping of mappings) {
      const block = blockMap.get(mapping.block_id);
      if (!block) continue;

      // Compare current Feishu content hash with our stored hash
      const blockText = blocksToMarkdown([block]);
      const newHash = hashContent(blockText);

      if (newHash === mapping.content_hash) continue;
      changesDetected++;

      // Get system content for this mapped entity
      let systemContent = '';
      if (mapping.block_type === 'task_bullet' || mapping.block_type === 'task_record') {
        const taskId = parseInt(mapping.system_entity_ref, 10);
        if (taskId) {
          const task = db.prepare(
            'SELECT task_name, completion_note FROM client_delivery_tasks WHERE id = ?'
          ).get(taskId) as { task_name: string; completion_note: string } | undefined;
          if (task) {
            if (mapping.block_type === 'task_bullet') {
              systemContent = '- ' + task.task_name;
            } else if (mapping.block_type === 'task_record') {
              systemContent = task.completion_note || '记录：';
            }
          }
        }
      } else if (mapping.block_type === 'stage_heading') {
        systemContent = '# ' + mapping.system_entity_ref;
      }

      if (systemContent && systemContent !== blockText) {
        const ok = await updateFeishuDocBlockFormatted(documentId, mapping.block_id, systemContent);
        if (ok) {
          db.prepare(
            'UPDATE feishu_block_mappings SET content_hash = ?, last_synced_at = ? WHERE id = ?'
          ).run(hashContent(systemContent), now, mapping.id);
          changesApplied++;
          details.push({
            blockId: mapping.block_id,
            changeType: 'content_pushed',
            description: `已将系统内容推送至飞书块 ${mapping.block_id}`,
          });
        }
      }
    }

    db.prepare(
      `INSERT INTO feishu_sync_log
       (ip_id, document_id, direction, trigger, changes_detected, changes_applied, details, status, triggered_by)
       VALUES (?, ?, 'system_to_feishu', 'manual', ?, ?, ?, 'success', ?)`,
    ).run(ipId, documentId, changesDetected, changesApplied, JSON.stringify(details), triggeredBy || null);

    return { success: true, changesDetected, changesApplied, details };
  } catch (e) {
    const errMsg = (e as Error).message;
    db.prepare(
      `INSERT INTO feishu_sync_log
       (ip_id, document_id, direction, trigger, changes_detected, changes_applied, details, status, error_message, triggered_by)
       VALUES (?, ?, 'system_to_feishu', 'manual', ?, ?, ?, 'error', ?, ?)`,
    ).run(ipId, documentId, changesDetected, changesApplied, JSON.stringify(details), errMsg, triggeredBy || null);
    return { success: false, changesDetected, changesApplied, details, error: errMsg };
  }
}
