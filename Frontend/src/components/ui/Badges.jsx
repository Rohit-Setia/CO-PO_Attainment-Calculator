import { Badge } from './badge';

export function RoleBadge({ role, className = '', ...props }) {
  const palette = {
    Admin: 'destructive',
    'Examination Team': 'default',
    Teacher: 'success',
    Viewer: 'secondary',
  };

  return (
    <Badge variant={palette[role] || 'secondary'} className={className} {...props}>
      {role}
    </Badge>
  );
}

export function CourseStatusBadge({ hasMapping, hasInternalMarks, hasExternalMarks, className = '' }) {
  const complete = hasMapping && hasInternalMarks && hasExternalMarks;
  const variant = complete ? 'success' : 'warning';
  const label = complete ? 'Configured' : 'In progress';

  return (
    <Badge variant={variant} className={className}>
      {label}
    </Badge>
  );
}
