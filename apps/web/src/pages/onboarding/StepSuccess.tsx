import React, { useEffect, useState } from 'react';
import { Icon } from '../../components/Icon.js';

const CHECKLIST = [
  'Provisioning your workspace',
  'Setting up your admin account',
  'Applying your plan',
  'Almost there',
];

export const StepSuccess: React.FC<{ subdomain: string }> = ({ subdomain }) => {
  const [done, setDone] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setDone(d => (d < CHECKLIST.length ? d + 1 : d));
    }, 350);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="ob-success">
      <div className="ob-success-icon"><Icon name="checkCircle" size={40} /></div>
      <h1 className="login-headline">Your workspace is ready</h1>
      <p className="login-subtext">{subdomain}.hudumika.app</p>
      <ul className="ob-checklist">
        {CHECKLIST.map((item, i) => (
          <li key={item} className={i < done ? 'ob-checklist-item ob-checklist-item--done' : 'ob-checklist-item'}>
            <Icon name={i < done ? 'checkCircle' : 'circle'} size={15} />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};
