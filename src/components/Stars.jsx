import { useState } from 'react';
import Icons from './Icons';

export function Stars({ value = 0, size = 'sm' }) {
  const filled = Math.round(value);
  return (
    <div className={`stars ${size}`}>
      {[1, 2, 3, 4, 5].map(i => (
        <Icons.Star key={i} filled={i <= filled} stroke="var(--gold)" fill={i <= filled ? 'var(--gold)' : 'none'} />
      ))}
    </div>
  );
}

export function StarsInput({ value = 0, onChange }) {
  const [hovered, setHovered] = useState(0);
  const active = hovered || value;

  return (
    <div className="stars-input">
      {[1, 2, 3, 4, 5].map(i => (
        <button
          key={i}
          className={i <= active ? 'filled' : ''}
          onMouseEnter={() => setHovered(i)}
          onMouseLeave={() => setHovered(0)}
          onClick={() => onChange(i)}
          type="button"
        >
          <Icons.Star
            size={18}
            filled={i <= active}
            stroke={i <= active ? 'var(--gold)' : 'var(--line-strong)'}
            fill={i <= active ? 'var(--gold)' : 'none'}
          />
        </button>
      ))}
    </div>
  );
}
