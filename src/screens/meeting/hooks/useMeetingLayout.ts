import { useState, useMemo, useCallback } from 'react';
import { EdgeInsets } from 'react-native-safe-area-context';
import { GridLayoutInfo } from '../views/MeetingStageView';

export interface UseMeetingLayoutProps {
  windowWidth: number;
  windowHeight: number;
  insets: EdgeInsets;
  participantCount: number;
  hasActiveScreenShare: boolean;
  pinnedParticipantIdentity: string | null;
}

export const useMeetingLayout = ({
  windowWidth,
  windowHeight,
  insets,
  participantCount,
  hasActiveScreenShare,
  pinnedParticipantIdentity,
}: UseMeetingLayoutProps) => {
  const [isGridMode, setIsGridMode] = useState(false);

  const handleToggleLayout = useCallback(() => {
    setIsGridMode((prev) => !prev);
  }, []);

  const gridLayout: GridLayoutInfo = useMemo(() => {
    const isPortrait = windowHeight >= windowWidth;
    const availableWidth = windowWidth - 20; // 10 padding each side in multiGridContainer
    const availableHeight = Math.max(
      320,
      windowHeight - (insets.top + 68) - (insets.bottom + 92) - 20
    );

    const totalItems = participantCount;

    let cols = 2;
    let rows = 2;
    let gap = 8;
    let density: 'spacious' | 'normal' | 'compact' | 'ultra-compact' = 'normal';

    if (totalItems <= 1) {
      cols = 1;
      rows = 1;
      gap = 0;
      density = 'spacious';
    } else if (totalItems === 2) {
      if (isPortrait) {
        cols = 1;
        rows = 2;
        gap = 10;
        density = 'spacious';
      } else {
        cols = 2;
        rows = 1;
        gap = 10;
        density = 'spacious';
      }
    } else if (totalItems <= 4) {
      cols = 2;
      rows = 2;
      gap = 8;
      density = 'normal';
    } else if (totalItems <= 6) {
      cols = 2;
      rows = 3;
      gap = 8;
      density = 'compact';
    } else if (totalItems <= 8) {
      cols = 2;
      rows = 4;
      gap = 6;
      density = 'compact';
    } else {
      cols = availableWidth >= 550 ? 3 : 2;
      const heightFor5 = Math.floor((availableHeight - 4 * 6) / 5);
      if (heightFor5 >= 118 && totalItems >= 9) {
        rows = 5;
      } else {
        rows = 4;
      }
      gap = 6;
      density = 'ultra-compact';
    }

    const cardWidth = Math.floor((availableWidth - (cols - 1) * gap) / cols);
    let cardHeight: number;
    if (totalItems <= 1) {
      cardHeight = Math.min(Math.floor(availableHeight * 0.88), 480);
    } else if (totalItems <= 8 || (rows === 5 && totalItems <= 10)) {
      cardHeight = Math.max(114, Math.floor((availableHeight - (rows - 1) * gap) / rows));
    } else {
      cardHeight = Math.max(118, Math.floor((availableHeight - (rows - 1) * gap) / rows));
    }

    return {
      cols,
      rows,
      gap,
      cardWidth,
      cardHeight,
      density,
      isScrollable: totalItems > cols * rows,
    };
  }, [windowWidth, windowHeight, insets.top, insets.bottom, participantCount]);

  const isFullScreen =
    !isGridMode &&
    Boolean(hasActiveScreenShare || participantCount === 1 || pinnedParticipantIdentity);

  return {
    isGridMode,
    setIsGridMode,
    handleToggleLayout,
    gridLayout,
    isFullScreen,
  };
};

export default useMeetingLayout;
