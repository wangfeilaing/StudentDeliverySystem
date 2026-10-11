# -*- coding: utf-8 -*-
# 通用语音转写：python3 transcribe.py <ids.txt> <音频目录> <输出json>
import json, os, sys
from faster_whisper import WhisperModel

ids = open(sys.argv[1]).read().split()
audio_dir = sys.argv[2]
out = sys.argv[3]
m = WhisperModel('small', device='cpu', compute_type='int8')
res = {}
for i, vid in enumerate(ids, 1):
    mp3 = f'{audio_dir}/{vid}.mp3'
    if not os.path.exists(mp3):
        res[vid] = {'transcript': '(下载失败)', 'thumbnail': ''}
        print(f'[{i}/{len(ids)}] {vid} 缺音频', flush=True)
        continue
    segs, _ = m.transcribe(mp3, language='zh', beam_size=5, initial_prompt='以下是一段中文普通话口播文案。')
    text = ''.join(s.text for s in segs).strip()
    thumb = ''
    ij = f'{audio_dir}/{vid}.info.json'
    if os.path.exists(ij):
        try:
            thumb = json.load(open(ij, encoding='utf-8')).get('thumbnail', '') or ''
        except Exception:
            pass
    res[vid] = {'transcript': text, 'thumbnail': thumb}
    print(f'[{i}/{len(ids)}] {vid} 转写 {len(text)} 字', flush=True)
json.dump(res, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
print('ALL_DONE')
