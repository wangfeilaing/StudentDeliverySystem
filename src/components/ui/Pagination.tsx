interface Props {
  page: number;
  totalPages: number;
  onPageChange: (p: number) => void;
  compact?: boolean;
}

export default function Pagination({ page, totalPages, onPageChange, compact = false }: Props) {
  if (totalPages <= 1) return null;

  const btnBase =
    'px-3 py-1.5 text-[13px] font-medium rounded-xl bg-black/5 border border-black/10 text-gray-500 hover:bg-black/5 disabled:opacity-30 transition-all duration-200';

  if (compact) {
    return (
      <div className="flex items-center gap-3 mt-6">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className={btnBase}
        >
          上一页
        </button>
        <span className="text-[13px] text-gray-500 font-medium tabular-nums select-none">
          第{page}/{totalPages}页
        </span>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className={btnBase}
        >
          下一页
        </button>
      </div>
    );
  }

  const pages: (number | string)[] = [];
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= page - 1 && i <= page + 1)) pages.push(i);
    else if (pages[pages.length - 1] !== '...') pages.push('...');
  }

  return (
    <div className="flex items-center gap-1.5 mt-6">
      <button
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        className={btnBase}
      >
        上一页
      </button>
      {pages.map((p, i) =>
        typeof p === 'string' ? (
          <span key={`d-${i}`} className="px-1 text-gray-600">
            ...
          </span>
        ) : (
          <button
            key={p}
            onClick={() => onPageChange(p)}
            className={`min-w-[34px] px-2.5 py-1.5 text-[13px] font-medium rounded-xl transition-all duration-200 ${
              p === page
                ? 'shadow-glow-blue border border-emerald-400/20 bg-gradient-to-r from-emerald-600 to-cyan-600 text-white'
                : 'bg-black/5 border border-black/10 text-gray-500 hover:bg-black/5'
            }`}
          >
            {p}
          </button>
        )
      )}
      <button
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        className={btnBase}
      >
        下一页
      </button>
    </div>
  );
}
