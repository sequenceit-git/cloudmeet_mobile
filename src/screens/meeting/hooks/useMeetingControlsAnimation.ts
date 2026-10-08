import { useState, useRef, useEffect, useCallback } from 'react';
import { Animated } from 'react-native';

export interface UseMeetingControlsAnimationProps {
  isNativePip: boolean;
  isMinimized?: boolean;
  isAnyModalOpen: boolean;
}

export const useMeetingControlsAnimation = ({
  isNativePip,
  isMinimized = false,
  isAnyModalOpen,
}: UseMeetingControlsAnimationProps) => {
  const [showControls, setShowControls] = useState(true);
  const controlsOpacity = useRef(new Animated.Value(1)).current;
  const headerTranslateY = useRef(new Animated.Value(0)).current;
  const footerTranslateY = useRef(new Animated.Value(0)).current;
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const resetControlsTimer = useCallback(() => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
    }
    if (isAnyModalOpen) {
      return;
    }
    hideTimeoutRef.current = setTimeout(() => {
      setShowControls(false);
    }, 5500);
  }, [isAnyModalOpen]);

  useEffect(() => {
    if (isAnyModalOpen) {
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
      setShowControls(true);
    } else {
      resetControlsTimer();
    }
  }, [isAnyModalOpen, resetControlsTimer]);

  const [showPipActions, setShowPipActions] = useState(false);
  const pipActionsOpacity = useRef(new Animated.Value(0)).current;
  const pipActionsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetPipActionsTimer = useCallback(() => {
    if (pipActionsTimeoutRef.current) {
      clearTimeout(pipActionsTimeoutRef.current);
    }
    pipActionsTimeoutRef.current = setTimeout(() => {
      setShowPipActions(false);
    }, 3000);
  }, []);

  const handleScreenTap = useCallback(() => {
    if (isNativePip) {
      setShowPipActions(prev => {
        const next = !prev;
        if (next) {
          resetPipActionsTimer();
        } else if (pipActionsTimeoutRef.current) {
          clearTimeout(pipActionsTimeoutRef.current);
          pipActionsTimeoutRef.current = null;
        }
        return next;
      });
      return;
    }
    setShowControls(prev => {
      const next = !prev;
      if (next) {
        resetControlsTimer();
      } else {
        if (hideTimeoutRef.current) {
          clearTimeout(hideTimeoutRef.current);
          hideTimeoutRef.current = null;
        }
      }
      return next;
    });
  }, [isNativePip, resetControlsTimer, resetPipActionsTimer]);

  useEffect(() => {
    if (!isNativePip) {
      setShowPipActions(false);
      if (pipActionsTimeoutRef.current) {
        clearTimeout(pipActionsTimeoutRef.current);
        pipActionsTimeoutRef.current = null;
      }
      setShowControls(true);
      resetControlsTimer();
      return;
    }
    setShowControls(false);
    setShowPipActions(false);
  }, [isNativePip, resetControlsTimer]);

  useEffect(() => {
    Animated.timing(pipActionsOpacity, {
      toValue: showPipActions ? 1 : 0,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [showPipActions, pipActionsOpacity]);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(controlsOpacity, {
        toValue: showControls ? 1 : 0,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(headerTranslateY, {
        toValue: showControls ? 0 : -100,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(footerTranslateY, {
        toValue: showControls ? 0 : 120,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start();
  }, [showControls, controlsOpacity, headerTranslateY, footerTranslateY]);

  return {
    showControls,
    setShowControls,
    controlsOpacity,
    headerTranslateY,
    footerTranslateY,
    resetControlsTimer,
    showPipActions,
    pipActionsOpacity,
    resetPipActionsTimer,
    handleScreenTap,
  };
};

export default useMeetingControlsAnimation;
