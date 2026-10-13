import React from 'react';
import { medalColor } from '../utils/ranking';
import { useAppTheme } from '../theme/theme';
import Hanko from './ui/Hanko';

interface RankBadgeProps {
  rank: number;
  size?: number;
}

// Posizione in classifica: timbro rotondo oro, argento o bronzo per i primi tre
const RankBadge: React.FC<RankBadgeProps> = ({ rank, size = 28 }) => {
  const { colors } = useAppTheme();
  const medal = medalColor(rank, colors);
  return (
    <Hanko
      label={String(rank)}
      size={size}
      shape="circle"
      tilt={0}
      color={medal ?? colors.surfaceVariant}
      textColor={medal ? '#FFFFFF' : colors.onSurfaceVariant}
    />
  );
};

export default RankBadge;
