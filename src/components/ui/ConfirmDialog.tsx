'use client';
import Modal from './Modal';
import Button from './Button';

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  loading?: boolean;
  type?: 'danger' | 'warning' | 'info';
}

const iconConfig: Record<string, { bg: string; svg: React.ReactNode }> = {
  danger: {
    bg: 'bg-red-500/10',
    svg: (
      <svg className="w-10 h-10 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z"
        />
      </svg>
    ),
  },
  warning: {
    bg: 'bg-amber-500/10',
    svg: (
      <svg className="w-10 h-10 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M12 8v4m0 4h.01M12 2a10 10 0 100 20 10 10 0 000-20z"
        />
      </svg>
    ),
  },
  info: {
    bg: 'bg-emerald-500/10',
    svg: (
      <svg className="w-10 h-10 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20 10 10 0 000-20z"
        />
      </svg>
    ),
  },
};

export default function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = '确认删除',
  loading,
  type = 'danger',
}: Props) {
  const icon = iconConfig[type];

  const modalClassName =
    type === 'danger'
      ? 'shadow-[0_0_40px_rgba(239,68,68,0.1)] ring-1 ring-red-500/10'
      : '';

  return (
    <Modal open={open} onClose={onClose} title={title} className={modalClassName}>
      <div className="flex flex-col items-center text-center">
        <div className={`mb-4 p-3 rounded-full ${icon.bg}`}>
          {icon.svg}
        </div>
        <p className="text-[14px] text-gray-500 mb-6 leading-relaxed">{message}</p>
      </div>
      <div className="flex justify-end gap-3">
        <Button variant="secondary" onClick={onClose} disabled={loading}>
          取消
        </Button>
        <Button
          variant={type === 'danger' ? 'danger' : 'primary'}
          onClick={onConfirm}
          disabled={loading}
        >
          {loading ? '处理中...' : confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
