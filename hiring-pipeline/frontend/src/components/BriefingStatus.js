import React from 'react';

function BriefingStatus({ status, token }) {
  if (!status) return <span className="badge badge-pending">No Briefing</span>;

  return (
    <span className={`badge badge-${status}`}>
      {status === 'pending' && 'Pending'}
      {status === 'in_progress' && 'In Progress'}
      {status === 'completed' && 'Passed'}
      {status === 'failed' && 'Failed'}
    </span>
  );
}

export default BriefingStatus;
