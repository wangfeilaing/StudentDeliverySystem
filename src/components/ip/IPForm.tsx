'use client';
import { useState, useEffect, FormEvent, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import Select from '@/components/ui/Select';
import Button from '@/components/ui/Button';
import ImageCropper from '@/components/ui/ImageCropper';
import AccountManager, { AccountManagerHandle } from '@/components/account/AccountManager';

interface IPData {
  id?: number;
  name: string;
  category: string;
  tags: string;
  description: string;
  avatar_path: string | null;
  status: string;
  service_tier?: string;
  paid_amount?: number;
  product_type_id?: number;
  course_start_date?: string;
  batch_number?: string;
  real_name?: string;
  nickname?: string;
  gender?: string;
  birthday?: string;
  phone?: string;
  wechat?: string;
  email?: string;
  location?: string;
  cooperation_type?: string;
  cooperation_start_date?: string;
  cooperation_end_date?: string;
  owner_user_id?: number;
  business_user_id?: number;
  content_user_id?: number;
  id_card?: string;
  bank_account?: string;
  bank_address?: string;
  contract_no?: string;
  emergency_contact?: string;
  sensitive_notes?: string;
}

interface Props { initial?: IPData; isEdit?: boolean; }

const categoryOptions = [
  { value: '', label: '请选择分类' },
  { value: '游戏', label: '游戏' }, { value: '美妆', label: '美妆' }, { value: '科技', label: '科技' },
  { value: '生活', label: '生活' }, { value: '美食', label: '美食' }, { value: '时尚', label: '时尚' },
  { value: '知识', label: '知识' }, { value: '音乐', label: '音乐' }, { value: '体育', label: '体育' }, { value: '其他', label: '其他' },
];

const genderOptions = [
  { value: '', label: '请选择' },
  { value: '男', label: '男' }, { value: '女', label: '女' },
];

const cooperationTypeOptions = [
  { value: '', label: '请选择' },
  { value: '代运营', label: '代运营' }, { value: '商单', label: '商单' },
  { value: '孵化', label: '孵化' }, { value: '联合运营', label: '联合运营' }, { value: '其他', label: '其他' },
];

const statusOptions = [
  { value: 'active', label: '合作中' },
  { value: 'paused', label: '暂停合作' },
  { value: 'ended', label: '已结束' },
];

function deriveServiceTier(productTypeId: string): string {
  if (productTypeId === '1') return '6980';
  if (productTypeId === '2') return '19800';
  if (productTypeId === '3') return 'cooperation';
  return '';
}

function getNextMonday(dateStr?: string): string {
  const d = dateStr ? new Date(dateStr + 'T00:00:00') : new Date();
  const day = d.getDay();
  const daysUntilMonday = day === 1 ? 0 : day === 0 ? 1 : 8 - day;
  d.setDate(d.getDate() + daysUntilMonday);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const batchDateOptions = [
  { value: '', label: '请选择期数' },
  { value: '第1期', label: '第1期（5月25日·周一开课）' },
  { value: '第2期', label: '第2期（6月15日·周一开课）' },
  { value: 'auto', label: '新一期（最近周一开课）' },
];

function SectionTitle({ title, icon, color = 'emerald' }: { title: string; icon: string; color?: string }) {
  const borderColorMap: Record<string, string> = {
    emerald: 'border-l-emerald-400',
    cyan: 'border-l-cyan-400',
    amber: 'border-l-amber-400',
  };
  return (
    <div className={`flex items-center gap-3 mb-4 py-2 pl-3 border-l-[3px] rounded-r-lg ${borderColorMap[color]} bg-white/[0.02]`}>
      <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d={icon} />
      </svg>
      <h3 className="text-[14px] font-semibold text-gray-700">{title}</h3>
    </div>
  );
}

export default function IPForm({ initial, isEdit }: Props) {
  const router = useRouter();
  const [returnUrl, setReturnUrl] = useState('');

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    setReturnUrl(p.get('returnUrl') || '');
  }, []);

  // 基础信息
  const [name, setName] = useState(initial?.name || '');
  const [realName, setRealName] = useState(initial?.real_name || '');
  const [nickname, setNickname] = useState(initial?.nickname || '');
  const [gender, setGender] = useState(initial?.gender || '');
  const [birthday, setBirthday] = useState(initial?.birthday || '');
  const [phone, setPhone] = useState(initial?.phone || '');
  const [wechat, setWechat] = useState(initial?.wechat || '');
  const [email, setEmail] = useState(initial?.email || '');
  const [location, setLocation] = useState(initial?.location || '');
  const [category, setCategory] = useState(initial?.category || '');
  const [tags, setTags] = useState(initial?.tags || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(
    initial?.avatar_path ? `/api/uploads/${initial.avatar_path}` : null
  );
  const [pendingCropFile, setPendingCropFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 合作信息
  const [status, setStatusLocal] = useState(initial?.status || 'active');
  const [paidAmount, setPaidAmount] = useState(String(initial?.paid_amount || ''));
  const [productTypeId, setProductTypeId] = useState(String(initial?.product_type_id || ''));
  const [productTypeOptions, setProductTypeOptions] = useState<Array<{ value: string; label: string }>>([{ value: '', label: '请选择产品类型' }]);
  const [cooperationType, setCooperationType] = useState(initial?.cooperation_type || '');
  const [courseStartDate, setCourseStartDate] = useState(initial?.course_start_date || '');
  const [batchNumber, setBatchNumber] = useState(initial?.batch_number || '');

  // Auto-set course start date from batch selection
  useEffect(() => {
    if (batchNumber === '第1期') setCourseStartDate('2026-05-25');
    else if (batchNumber === '第2期') setCourseStartDate('2026-06-15');
    else if (batchNumber === 'auto') setCourseStartDate(getNextMonday());
    // 第3期+ handled dynamically via getNextMonday
  }, [batchNumber]);

  useEffect(() => {
    fetch('/api/products')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          setProductTypeOptions([
            { value: '', label: '请选择产品类型' },
            ...data.map((p: { id: number; name: string }) => ({ value: String(p.id), label: p.name })),
          ]);
        }
      }).catch(() => {});
  }, []);
  const [coopStartDate, setCoopStartDate] = useState(initial?.cooperation_start_date || '');
  const [coopEndDate, setCoopEndDate] = useState(initial?.cooperation_end_date || '');
  const [ownerUserId, setOwnerUserId] = useState(initial?.owner_user_id?.toString() || '');
  const [businessUserId, setBusinessUserId] = useState(initial?.business_user_id?.toString() || '');
  const [contentUserId, setContentUserId] = useState(initial?.content_user_id?.toString() || '');

  // 隐私信息
  const [idCard, setIdCard] = useState(initial?.id_card || '');
  const [bankAccount, setBankAccount] = useState(initial?.bank_account || '');
  const [bankAddress, setBankAddress] = useState(initial?.bank_address || '');
  const [contractNo, setContractNo] = useState(initial?.contract_no || '');
  const [emergencyContact, setEmergencyContact] = useState(initial?.emergency_contact || '');
  const [sensitiveNotes, setSensitiveNotes] = useState(initial?.sensitive_notes || '');
  const [showSensitive, setShowSensitive] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const accountRef = useRef<AccountManagerHandle>(null);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPendingCropFile(file);
      // Reset input so re-selecting the same file triggers onChange
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleCropComplete = (croppedFile: File) => {
    setAvatarFile(croppedFile);
    setAvatarPreview(URL.createObjectURL(croppedFile));
    setPendingCropFile(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError('IP 名称不能为空'); return; }
    setSaving(true); setError('');
    const formData = new FormData();
    formData.append('name', name.trim());
    formData.append('category', category);
    formData.append('tags', tags);
    formData.append('description', description);
    if (avatarFile) formData.append('avatar', avatarFile);
    // 基础信息
    formData.append('real_name', realName);
    formData.append('nickname', nickname);
    formData.append('gender', gender);
    formData.append('birthday', birthday);
    formData.append('phone', phone);
    formData.append('wechat', wechat);
    formData.append('email', email);
    formData.append('location', location);
    // 合作信息
    formData.append('status', status);
    formData.append('service_tier', deriveServiceTier(productTypeId));
    formData.append('paid_amount', paidAmount);
    formData.append('product_type_id', productTypeId);
    formData.append('course_start_date', courseStartDate);
    formData.append('batch_number', batchNumber);
    formData.append('cooperation_type', cooperationType);
    formData.append('cooperation_start_date', coopStartDate);
    formData.append('cooperation_end_date', coopEndDate);
    formData.append('owner_user_id', ownerUserId);
    formData.append('business_user_id', businessUserId);
    formData.append('content_user_id', contentUserId);
    // 隐私信息
    formData.append('id_card', idCard);
    formData.append('bank_account', bankAccount);
    formData.append('bank_address', bankAddress);
    formData.append('contract_no', contractNo);
    formData.append('emergency_contact', emergencyContact);
    formData.append('sensitive_notes', sensitiveNotes);
    try {
      // Save accounts first (if editing)
      if (isEdit && accountRef.current) {
        await accountRef.current.saveAccounts();
      }

      const url = isEdit ? `/api/ips/${initial!.id}` : '/api/ips';
      const method = isEdit ? 'PUT' : 'POST';
      const res = await fetch(url, { method, body: formData });
      if (!res.ok) { const data = await res.json(); throw new Error(data.error || '操作失败'); }
      if (isEdit) { router.push(returnUrl || '/ips'); } else { router.push('/ips'); }
    } catch (err) { setError((err as Error).message); }
    finally { setSaving(false); }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && <div className="p-3.5 bg-red-500/10 border border-red-400/20 rounded-2xl text-[13px] text-red-400">{error}</div>}

      {/* ===== 基础信息 ===== */}
      <div className="glass-card p-5 lg:p-6">
        <SectionTitle title="基础信息" icon="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Input label="IP 名称 *" value={name} onChange={e => setName(e.target.value)} placeholder="输入 IP 名称" />
          <Input label="真实姓名" value={realName} onChange={e => setRealName(e.target.value)} placeholder="真实姓名" />
          <Select label="分类" value={category} onChange={e => setCategory(e.target.value)} options={categoryOptions} />
          <Select label="性别" value={gender} onChange={e => setGender(e.target.value)} options={genderOptions} />
          <Input label="所在地" value={location} onChange={e => setLocation(e.target.value)} placeholder="城市" />
        </div>
        <div className="mt-4">
          <Textarea label="简介" value={description} onChange={e => setDescription(e.target.value)} placeholder="简介..." rows={3} />
        </div>
        <div className="mt-4">
          <label className="block text-[12px] font-medium text-gray-500 mb-1.5 ml-1">头像</label>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500/10 to-cyan-500/10 border border-dashed border-black/10 flex items-center justify-center overflow-hidden flex-shrink-0">
              {avatarPreview ? (
                <img src={avatarPreview} alt="预览" className="w-full h-full object-cover rounded-2xl" />
              ) : (
                <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
                </svg>
              )}
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarChange}
              className="text-[13px] text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-[13px] file:font-semibold file:bg-gradient-to-r file:from-emerald-600 file:to-cyan-600 file:text-white hover:file:from-emerald-500 hover:file:to-cyan-500 transition-all" />
          </div>
        </div>
      </div>

      {/* ===== 合作信息 ===== */}
      <div className="glass-card p-5 lg:p-6">
        <SectionTitle title="合作信息" icon="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" color="cyan" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Select label="合作状态" value={status} onChange={e => setStatusLocal(e.target.value)} options={statusOptions} />
          <Select label="产品类型" value={productTypeId} onChange={e => setProductTypeId(e.target.value)} options={productTypeOptions} />
          <Select label="期数" value={batchNumber} onChange={e => setBatchNumber(e.target.value)} options={batchDateOptions} />
          <Input label="课程开始日期" type="date" value={courseStartDate} onChange={e => setCourseStartDate(e.target.value)} placeholder="选择课程开始日期" />
          <Select label="合作类型" value={cooperationType} onChange={e => setCooperationType(e.target.value)} options={cooperationTypeOptions} />
          <Input label="合作开始时间" value={coopStartDate} onChange={e => setCoopStartDate(e.target.value)} placeholder="如 2025-01-01" />
          <Input label="合作结束时间" value={coopEndDate} onChange={e => setCoopEndDate(e.target.value)} placeholder="留空表示至今" />
        </div>
      </div>

      {/* ===== 平台账号 ===== */}
      {isEdit && (
        <div className="glass-card p-5 lg:p-6">
          <SectionTitle title="平台账号" icon="M12 18h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
          <AccountManager ref={accountRef} ipId={initial!.id!} />
        </div>
      )}

      {/* ===== 隐私信息 ===== */}
      <div className="glass-card p-5 lg:p-6">
        <SectionTitle title="隐私信息" icon="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" color="amber" />
        <div className="p-4 bg-amber-500/10 border border-amber-400/20 rounded-2xl mb-4">
          <p className="text-[12px] text-amber-400 flex items-center gap-1.5">
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            以下信息为敏感数据，仅管理员和授权人员可见。查看操作将被记录。
          </p>
        </div>
        {!showSensitive && (
          <button type="button" onClick={() => setShowSensitive(true)}
            className="px-4 py-2.5 bg-black/5 border border-black/10 rounded-xl text-[13px] text-gray-500 hover:bg-black/5 transition-colors flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
            </svg>
            点击展开隐私信息编辑
          </button>
        )}
        {showSensitive && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-fade-up">
            <Input label="身份证号" value={idCard} onChange={e => setIdCard(e.target.value)} placeholder="身份证号" />
            <Input label="收款账号" value={bankAccount} onChange={e => setBankAccount(e.target.value)} placeholder="银行账号" />
            <Input label="开户地址" value={bankAddress} onChange={e => setBankAddress(e.target.value)} placeholder="开户银行" />
            <Input label="合同编号" value={contractNo} onChange={e => setContractNo(e.target.value)} placeholder="合同编号" />
            <Input label="紧急联系人" value={emergencyContact} onChange={e => setEmergencyContact(e.target.value)} placeholder="姓名 手机号" />
            <div className="lg:col-span-3">
              <Textarea label="其他敏感备注" value={sensitiveNotes} onChange={e => setSensitiveNotes(e.target.value)} placeholder="其他需要保密的备注..." rows={3} />
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-3">
        <Button type="submit" disabled={saving}>{saving ? '保存中...' : isEdit ? '更新 IP' : '创建 IP'}</Button>
        <Button type="button" variant="secondary" onClick={() => router.back()}>取消</Button>
      </div>

      {pendingCropFile && (
        <ImageCropper
          file={pendingCropFile}
          onCrop={handleCropComplete}
          onCancel={() => setPendingCropFile(null)}
        />
      )}
    </form>
  );
}
