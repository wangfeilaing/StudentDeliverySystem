import { getDb } from '@/lib/db';
import { notFound } from 'next/navigation';
import IPForm from '@/components/ip/IPForm';

export default async function EditIPPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ipId = parseInt(id, 10);
  if (isNaN(ipId)) notFound();
  const db = getDb();
  const ip = db.prepare("SELECT * FROM ip WHERE id = ?").get(ipId) as Record<string, unknown> | undefined;
  if (!ip) notFound();
  return (
    <div className="animate-fade-up p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-800">编辑 IP</h1>
        <p className="text-[13px] text-gray-500 mt-1">修改学员资料后点击「更新 IP」保存</p>
      </div>
      <IPForm isEdit initial={{
          id: ip.id as number,
          name: ip.name as string,
          category: ip.category as string,
          tags: ip.tags as string,
          description: ip.description as string,
          avatar_path: ip.avatar_path as string | null,
          status: ip.status as string,
          real_name: (ip.real_name as string) || '',
          nickname: (ip.nickname as string) || '',
          gender: (ip.gender as string) || '',
          birthday: (ip.birthday as string) || '',
          phone: (ip.phone as string) || '',
          wechat: (ip.wechat as string) || '',
          email: (ip.email as string) || '',
          location: (ip.location as string) || '',
          cooperation_type: (ip.cooperation_type as string) || '',
          cooperation_start_date: (ip.cooperation_start_date as string) || '',
          cooperation_end_date: (ip.cooperation_end_date as string) || '',
          owner_user_id: ip.owner_user_id as number,
          business_user_id: ip.business_user_id as number,
          content_user_id: ip.content_user_id as number,
          id_card: (ip.id_card as string) || '',
          bank_account: (ip.bank_account as string) || '',
          bank_address: (ip.bank_address as string) || '',
          contract_no: (ip.contract_no as string) || '',
          emergency_contact: (ip.emergency_contact as string) || '',
          sensitive_notes: (ip.sensitive_notes as string) || '',
          service_tier: (ip.service_tier as string) || '',
          paid_amount: ip.paid_amount as number,
          product_type_id: ip.product_type_id as number,
          course_start_date: (ip.course_start_date as string) || '',
          batch_number: (ip.batch_number as string) || '',
        }} />
    </div>
  );
}
