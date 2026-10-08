import { StyleSheet } from 'react-native';
import { meetingLayoutStyles } from './styles/meetingLayoutStyles';
import { meetingDrawerStyles } from './styles/meetingDrawerStyles';
import { meetingModalStyles } from './styles/meetingModalStyles';
import { meetingWaitingRoomStyles } from './styles/meetingWaitingRoomStyles';

export const styles = StyleSheet.create({
  ...meetingLayoutStyles,
  ...meetingDrawerStyles,
  ...meetingModalStyles,
  ...meetingWaitingRoomStyles,
} as any);

export default styles;
