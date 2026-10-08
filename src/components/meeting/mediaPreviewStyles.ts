import { StyleSheet, Dimensions } from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'rgba(5, 10, 20, 0.97)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  circleBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },
  headerInfo: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    marginRight: 8,
  },
  categoryText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    flexShrink: 1,
  },
  headerSubtitle: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Image Styles
  imageScrollView: {
    flex: 1,
    width: '100%',
  },
  imageScrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageWrapper: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.75,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.75,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(5, 10, 20, 0.5)',
  },
  loadingText: {
    color: '#94A3B8',
    fontSize: 13,
    marginTop: 10,
    fontWeight: '500',
  },

  // Error Card Styles
  errorCard: {
    padding: 24,
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    maxWidth: SCREEN_WIDTH - 48,
  },
  errorTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 12,
  },
  errorSubtitle: {
    color: '#94A3B8',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },
  errorActions: {
    flexDirection: 'row',
    marginTop: 16,
    gap: 12,
  },
  errorRetryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#00A8FF',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  errorRetryText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  errorCopyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  errorCopyText: {
    color: '#E2E8F0',
    fontSize: 13,
    fontWeight: '600',
  },

  // Video Styles
  videoCardContainer: {
    width: '100%',
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  videoCardBox: {
    width: '100%',
    aspectRatio: 16 / 10,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(0, 168, 255, 0.35)',
    elevation: 8,
  },
  videoCardInner: {
    flex: 1,
    justifyContent: 'space-between',
    padding: 16,
  },
  videoCenterIcon: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playGlowBtn: {
    width: 76,
    height: 76,
    borderRadius: 38,
    shadowColor: '#00A8FF',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 14,
    elevation: 10,
  },
  playGlowGradient: {
    flex: 1,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoCardFooter: {
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    borderRadius: 12,
    padding: 10,
  },
  videoInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  videoCardName: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    flexShrink: 1,
  },
  videoMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 8,
  },
  videoBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.25)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  videoBadgeText: {
    color: '#10B981',
    fontSize: 11,
    fontWeight: '700',
  },
  videoMetaText: {
    color: '#94A3B8',
    fontSize: 11,
  },
  playPrimaryBtn: {
    width: '100%',
    marginTop: 20,
    borderRadius: 14,
    overflow: 'hidden',
    elevation: 6,
  },
  playPrimaryGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
    paddingHorizontal: 20,
  },
  playPrimaryBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  secondaryActionsRow: {
    flexDirection: 'row',
    marginTop: 14,
    gap: 16,
  },
  secondaryActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  secondaryActionText: {
    color: '#00A8FF',
    fontSize: 12,
    fontWeight: '700',
  },

  // Audio Styles
  audioCardContainer: {
    width: '100%',
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  audioCardBox: {
    width: '100%',
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(245, 158, 11, 0.35)',
  },
  audioCardInner: {
    padding: 24,
    alignItems: 'center',
  },
  audioWaveformRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 100,
    gap: 8,
  },
  audioWaveBar: {
    width: 6,
    borderRadius: 3,
  },
  audioMetaInfo: {
    marginTop: 16,
    alignItems: 'center',
  },
  audioFileName: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  audioDuration: {
    color: '#F59E0B',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },

  // Document Styles
  docCardContainer: {
    width: '100%',
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  docCardBox: {
    width: '100%',
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(139, 92, 246, 0.35)',
  },
  docCardInner: {
    padding: 28,
    alignItems: 'center',
  },
  docLargeIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  docTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  docMeta: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 6,
  },

  // Caption Pill
  captionPill: {
    alignSelf: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    maxWidth: SCREEN_WIDTH - 48,
  },
  captionText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
  },

  // Toast
  toast: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#10B981',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
    shadowColor: '#00A8FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  toastText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
});
