import React from 'react';

function ConsultantRankBadge({ rank }) {
  const cls = rank <= 3 ? `rank-${rank}` : 'rank-other';
  return <span className={`rank-badge ${cls}`}>#{rank}</span>;
}

export default ConsultantRankBadge;
