import IPForm from '@/components/ip/IPForm';

export default function NewIPPage() {
  return (
    <div className="animate-fade-up p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-800">新建 IP</h1>
        <p className="text-[13px] text-gray-500 mt-1">创建新学员并配置初始资料</p>
      </div>
      <IPForm />
    </div>
  );
}
