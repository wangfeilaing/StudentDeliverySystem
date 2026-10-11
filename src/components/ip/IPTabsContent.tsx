'use client';
import Tabs from '@/components/ui/Tabs';
import AccountList from '@/components/account/AccountList';
import ScreenshotGrid from '@/components/screenshot/ScreenshotGrid';
import VideoGrid from '@/components/video/VideoGrid';
import FeedbackList from '@/components/feedback/FeedbackList';
import SuccessCaseList from '@/components/case/SuccessCaseList';
import OperationLogList from '@/components/log/OperationLogList';
import DeliveryCalendar from '@/components/ip/DeliveryCalendar';

interface Account {
  id: number; platform: string; account_name: string; account_url: string;
  follower_count: number; notes: string;
}

interface Screenshot {
  id: number; title: string; category: string; file_path: string;
  file_size: number; created_at: string;
}

interface Video {
  id: number; title: string; category: string; file_path: string;
  file_size: number; created_at: string;
}

interface Feedback {
  id: number; ip_id: number; source: string; rating: number;
  content: string; reviewer_name: string; related_project: string;
  screenshot_ids: string; created_at: string;
}

interface CaseItem {
  id: number; title: string; platform: string; video_url: string;
  publish_date: string; play_count: number; like_count: number;
  comment_count: number; favorite_count: number; share_count: number;
  conversion_result: string; notes: string; created_at: string;
}

interface IPInfo {
  real_name: string; nickname: string; gender: string; birthday: string;
  phone: string; wechat: string; email: string; location: string;
  cooperation_type: string; cooperation_start_date: string; cooperation_end_date: string;
  id_card: string; bank_account: string; bank_address: string;
  contract_no: string; emergency_contact: string; sensitive_notes: string;
}

interface Stats {
  accountCount: number;
  screenshotCount: number;
  videoCount: number;
  feedbackCount: number;
  caseCount: number;
  taskCount: number;
}

interface TabDef { key: string; label: string; count?: number; }

interface Props {
  ipId: number;
  ipName: string;
  ipCategory: string;
  ipTags: string;
  ipStatus: string;
  ipAvatarPath: string | null;
  description: string | null;
  ipInfo: IPInfo;
  isAdmin: boolean;
  accounts: Account[];
  screenshots: Screenshot[];
  videos: Video[];
  feedbacks: Feedback[];
  cases: CaseItem[];
  tabs: TabDef[];
  productTypeId: number | null;
  courseStartDate: string;
  batchNumber: string;
  stats: Stats;
}

const cooperationTypeLabels: Record<string, string> = {
  '代运营': '代运营', '商单': '商单', '孵化': '孵化', '联合运营': '联合运营', '其他': '其他',
};

const statusLabels: Record<string, { label: string; cls: string }> = {
  active: { label: '合作中', cls: 'bg-emerald-500/10 text-emerald-600 border-emerald-400/20' },
  paused: { label: '暂停合作', cls: 'bg-amber-500/10 text-amber-600 border-amber-400/20' },
  ended: { label: '已结束', cls: 'bg-slate-500/10 text-gray-500 border-slate-400/20' },
  high_potential: { label: '高潜力', cls: 'bg-purple-500/10 text-purple-600 border-purple-400/20' },
};

function StatBadge({ label, value, color }: { label: string; value: number; color: string }) {
  const colorMap: Record<string, string> = {
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    blue: 'bg-blue-50 border-blue-200 text-blue-700',
    purple: 'bg-purple-50 border-purple-200 text-purple-700',
    amber: 'bg-amber-50 border-amber-200 text-amber-700',
    cyan: 'bg-cyan-50 border-cyan-200 text-cyan-700',
  };
  return (
    <div className={`flex flex-col items-center px-4 py-2.5 rounded-xl border ${colorMap[color] || colorMap.emerald}`}>
      <span className="text-[18px] font-bold font-mono">{value}</span>
      <span className="text-[10px] mt-0.5 opacity-70">{label}</span>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="flex items-center py-1">
      <span className="text-[12px] text-gray-400 w-18 flex-shrink-0">{label}</span>
      <span className="text-[13px] text-gray-700">{value}</span>
    </div>
  );
}

export default function IPTabsContent({ ipId, ipName, ipCategory, ipTags, ipStatus, ipAvatarPath, description, ipInfo, isAdmin, accounts, screenshots, videos, feedbacks, cases, tabs, productTypeId, courseStartDate, batchNumber, stats }: Props) {
  const statusBadge = statusLabels[ipStatus] || statusLabels.active;

  return (
    <div className="glass-card p-5">
      <Tabs tabs={tabs}>
        {(activeTab) => {
          switch (activeTab) {

            // ===== 学员简历 =====
            case 'resume':
              return (
                <div className="space-y-5">
                  {/* Hero card */}
                  <div className="glass-card p-5 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-bl from-emerald-500/5 to-cyan-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4 pointer-events-none" />
                    <div className="relative">
                      <div className="flex items-start gap-4 mb-4">
                        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 flex items-center justify-center text-2xl font-bold text-emerald-600 flex-shrink-0 overflow-hidden border border-emerald-400/15 shadow-[0_0_20px_rgba(16,185,129,0.1)]">
                          {ipAvatarPath ? (
                            <img src={`/api/uploads/${ipAvatarPath}`} alt={ipName} className="w-full h-full object-cover" />
                          ) : (
                            ipName.charAt(0)
                          )}
                        </div>
                        <div className="flex-1 min-w-0 pt-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h2 className="text-[18px] font-bold text-gray-800 tracking-tight">{ipName}</h2>
                            {ipInfo.real_name && ipInfo.real_name !== ipName && (
                              <span className="text-[13px] text-gray-500">({ipInfo.real_name})</span>
                            )}
                            <span className={`text-[10px] px-2 py-0.5 rounded-lg border ${statusBadge.cls}`}>{statusBadge.label}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            {ipCategory && (
                              <span className="text-[12px] px-2 py-0.5 rounded-md bg-gradient-to-r from-emerald-500/10 to-cyan-500/10 text-emerald-700 border border-emerald-400/15 font-medium">
                                {ipCategory}
                              </span>
                            )}
                            {ipInfo.location && (
                              <span className="text-[11px] text-gray-400 flex items-center gap-0.5">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                                {ipInfo.location}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {description && (
                        <div className="p-4 rounded-xl bg-gradient-to-r from-slate-50 to-white border border-slate-100">
                          <h4 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">个人简介 / 简历</h4>
                          <p className="text-[13px] text-gray-600 leading-relaxed whitespace-pre-wrap">{description}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Stats row */}
                  <div className="grid grid-cols-5 gap-2">
                    <StatBadge label="平台账号" value={stats.accountCount} color="blue" />
                    <StatBadge label="截图素材" value={stats.screenshotCount} color="emerald" />
                    <StatBadge label="视频素材" value={stats.videoCount} color="purple" />
                    <StatBadge label="跟进备注" value={stats.feedbackCount} color="amber" />
                    <StatBadge label="内容记录" value={stats.caseCount} color="cyan" />
                  </div>

                  {/* 合作概况 — full width */}
                  <div className="glass-card p-4">
                    <h4 className="text-[12px] font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                      </svg>
                      合作概况
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <InfoRow label="合作类型" value={cooperationTypeLabels[ipInfo.cooperation_type] || ipInfo.cooperation_type} />
                      <InfoRow label="开始时间" value={ipInfo.cooperation_start_date} />
                      <InfoRow label="结束时间" value={ipInfo.cooperation_end_date || '至今'} />
                    </div>
                    {isAdmin && (
                      <div className="mt-3 pt-3 border-t border-slate-100">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <InfoRow label="身份证号" value={ipInfo.id_card || '未填写'} />
                          <InfoRow label="合同编号" value={ipInfo.contract_no || '未填写'} />
                          <InfoRow label="紧急联系人" value={ipInfo.emergency_contact || '未填写'} />
                        </div>
                        {ipInfo.sensitive_notes && (
                          <div className="mt-3 pt-3 border-t border-amber-200">
                            <span className="text-[11px] text-amber-600 font-medium">内部备注：</span>
                            <p className="text-[12px] text-gray-600 mt-1">{ipInfo.sensitive_notes}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );

            // ===== 平台账号 =====
            case 'accounts':
              return <AccountList ipId={ipId} accounts={accounts} />;

            // ===== 交付进度 (Calendar) =====
            case 'delivery':
              return (
                <DeliveryCalendar
                  ipId={ipId}
                  productTypeId={productTypeId}
                  courseStartDate={courseStartDate}
                  batchNumber={batchNumber}
                />
              );

            // ===== 素材库 =====
            case 'materials':
              return (
                <div className="space-y-5">
                  <div>
                    <h3 className="text-[14px] font-semibold text-gray-700 mb-3">好评截图</h3>
                    <ScreenshotGrid ipId={ipId} screenshots={screenshots} />
                  </div>
                  <div>
                    <h3 className="text-[14px] font-semibold text-gray-700 mb-3">视频素材</h3>
                    <VideoGrid ipId={ipId} videos={videos} />
                  </div>
                </div>
              );

            // ===== 合作资料 =====
            case 'cooperation':
              return (
                <div className="space-y-5">
                  {isAdmin ? (
                    <div className="glass-card p-4">
                      <h4 className="text-[12px] font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        合作资料
                      </h4>
                      <p className="text-[13px] text-gray-500">合作资料模块，包含合同、报价单、授权文件等。</p>
                    </div>
                  ) : (
                    <div className="text-center py-10">
                      <svg className="w-10 h-10 text-gray-600 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                      <p className="text-[13px] text-gray-500">合作资料仅管理员可见</p>
                    </div>
                  )}
                  <AccountList ipId={ipId} accounts={accounts} />
                </div>
              );

            // ===== 操作记录 =====
            case 'logs':
              return <OperationLogList ipId={ipId} />;

            default:
              return null;
          }
        }}
      </Tabs>
    </div>
  );
}
