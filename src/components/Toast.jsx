import Icons from './Icons';

export default function Toast({ toasts = [] }) {
  return (
    <div className="toast-stack">
      {toasts.map(t => (
        <div key={t.id} className="toast">
          {t.icon === 'ai'
            ? <div className="ai-orb-sm"><Icons.Sparkle size={11} /></div>
            : <Icons.Check size={14} />
          }
          {t.msg}
        </div>
      ))}
    </div>
  );
}
