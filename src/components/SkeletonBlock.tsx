import type { CSSProperties, HTMLAttributes } from 'react';
import styles from '../styles/Skeleton.module.css';

type SkeletonVariant = 'block' | 'text' | 'pill' | 'circle';

export interface SkeletonBlockProps extends HTMLAttributes<HTMLSpanElement> {
  width?: number | string;
  height?: number | string;
  variant?: SkeletonVariant;
}

const formatSize = (value: number | string | undefined): string | undefined => {
  if (typeof value === 'number') {
    return `${value}px`;
  }
  return value;
};

const SkeletonBlock = ({
  width,
  height,
  variant = 'block',
  className,
  style,
  'aria-hidden': ariaHidden,
  ...rest
}: SkeletonBlockProps): JSX.Element => {
  const sizeStyle: CSSProperties = {
    width: formatSize(width),
    height: formatSize(height),
    ...style,
  };

  const classes = [styles.skeleton, styles[variant], className]
    .filter((token): token is string => Boolean(token))
    .join(' ');

  return (
    <span
      className={classes}
      style={sizeStyle}
      aria-hidden={ariaHidden ?? 'true'}
      {...rest}
    />
  );
};

export default SkeletonBlock;
