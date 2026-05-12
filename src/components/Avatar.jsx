const COLORS = ['#6B4FBB','#1F4E3D','#C2410C','#2F6CA8','#B83A52','#5C4A1F','#1A7A8A','#7A4A1A','#2563EB','#9333EA'];

function strHash(str = '') {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h) + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function getColor(user) {
  const key = user?.id || user?.email || '';
  return COLORS[strHash(key) % COLORS.length];
}

function getInitials(user) {
  const name =
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    user?.name ||
    user?.email ||
    '';
  const parts = name.split(/[\s@._-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return 'SE';
}

export default function Avatar({ user, size = 'sm' }) {
  if (!user) {
    return <div className={`avatar ${size}`} style={{ background: '#94908A' }}>SE</div>;
  }

  const avatarUrl = user.user_metadata?.avatar_url || user.avatar_url;

  if (avatarUrl) {
    return (
      <div className={`avatar ${size}`} style={{ background: getColor(user) }}>
        <img src={avatarUrl} alt={getInitials(user)} />
      </div>
    );
  }

  return (
    <div className={`avatar ${size}`} style={{ background: getColor(user) }}>
      {getInitials(user)}
    </div>
  );
}
