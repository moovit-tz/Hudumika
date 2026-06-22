import React from 'react';

type StatCardProps = {
  title: string;
  value: string | number;
  icon?: React.ComponentType<React.SVGProps<SVGSVGElement>>;
};

export const StatCard: React.FC<StatCardProps> = ({ title, value, icon: Icon }) => (
  <div className="card stat-card">
    {Icon && <Icon className="stat-card-icon" aria-hidden="true" />}
    <div>
      <div className="stat-card-label">{title}</div>
      <div className="stat-card-value">{value}</div>
    </div>
  </div>
);
