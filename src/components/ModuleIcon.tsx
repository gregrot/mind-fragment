import type { ModuleIconVariant } from '../simulation/robot/modules/moduleLibrary';
import styles from '../styles/ModuleIcon.module.css';

interface ModuleIconProps {
  variant: ModuleIconVariant;
}

const ICON_CONFIG: Record<ModuleIconVariant, { primary: string; accent: string; detail: string }> = {
  movement: { primary: '#4ecdc4', accent: '#1a535c', detail: '#f7fff7' },
  manipulation: { primary: '#f6b93b', accent: '#d35400', detail: '#fff1cf' },
  inventory: { primary: '#6ab04c', accent: '#218c74', detail: '#f6ffed' },
  crafting: { primary: '#9b59b6', accent: '#6c3483', detail: '#f5e6ff' },
  scanning: { primary: '#2980b9', accent: '#0c3d6b', detail: '#e6f4ff' },
  status: { primary: '#ff6b6b', accent: '#c0392b', detail: '#ffeaea' },
};

const ModuleIcon = ({ variant }: ModuleIconProps): JSX.Element => {
  const palette = ICON_CONFIG[variant];

  return (
    <svg className={styles.icon} viewBox="0 0 48 48" role="presentation" aria-hidden="true" focusable="false">
      <rect x="4" y="4" width="40" height="40" rx="12" fill={palette.primary} />
      {variant === 'movement' ? (
        <g>
          <path
            d="M16 24L28 14V20H36V28H28V34Z"
            fill={palette.detail}
            opacity="0.95"
          />
          <path
            d="M14 16H18V32H14Z"
            fill={palette.accent}
            opacity="0.85"
          />
        </g>
      ) : null}
      {variant === 'manipulation' ? (
        <g>
          <rect x="16" y="14" width="6" height="20" rx="3" fill={palette.detail} opacity="0.9" />
          <rect x="26" y="14" width="6" height="20" rx="3" fill={palette.detail} opacity="0.9" />
          <path
            d="M18 22H30C32 22 33 23.2 33 24.5C33 25.8 32 27 30 27H18C16 27 15 25.8 15 24.5C15 23.2 16 22 18 22Z"
            fill={palette.accent}
            opacity="0.75"
          />
        </g>
      ) : null}
      {variant === 'crafting' ? (
        <g>
          <circle cx="24" cy="24" r="9" fill={palette.detail} opacity="0.9" />
          <path
            d="M24 15L26.5 20L32 21L28 25L29 31L24 28.5L19 31L20 25L16 21L21.5 20Z"
            fill={palette.accent}
            opacity="0.8"
          />
        </g>
      ) : null}
      {variant === 'inventory' ? (
        <g>
          <rect x="12" y="16" width="24" height="18" rx="4" fill={palette.detail} opacity="0.95" />
          <rect x="10" y="22" width="28" height="14" rx="4" fill={palette.accent} opacity="0.65" />
          <path
            d="M18 22H30V32H18Z"
            fill={palette.detail}
            opacity="0.85"
          />
          <path
            d="M20 20H28L26 16H22Z"
            fill={palette.accent}
            opacity="0.7"
          />
        </g>
      ) : null}
      {variant === 'scanning' ? (
        <g>
          <circle cx="24" cy="24" r="4" fill={palette.detail} />
          <path
            d="M24 12C31.732 12 38 18.268 38 26"
            stroke={palette.detail}
            strokeWidth="3"
            strokeLinecap="round"
            opacity="0.85"
          />
          <path
            d="M24 18C28.4183 18 32 21.5817 32 26"
            stroke={palette.accent}
            strokeWidth="3"
            strokeLinecap="round"
            opacity="0.85"
          />
        </g>
      ) : null}
      {variant === 'status' ? (
        <g>
          <circle cx="24" cy="16" r="6" fill={palette.detail} opacity="0.95" />
          <circle cx="24" cy="16" r="4" fill={palette.accent} opacity="0.9" />
          <rect x="22" y="22" width="4" height="10" rx="2" fill={palette.detail} opacity="0.8" />
          <rect x="20" y="30" width="8" height="6" rx="2" fill={palette.accent} opacity="0.75" />
        </g>
      ) : null}
    </svg>
  );
};

export default ModuleIcon;
