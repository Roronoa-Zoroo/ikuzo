import { Image } from "expo-image";
import { Modal, StyleSheet, View } from "react-native";
import {
  GestureDetector,
  GestureHandlerRootView,
  usePanGesture,
  usePinchGesture,
  useSimultaneousGestures,
  useTapGesture,
} from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { scheduleOnRN } from "react-native-worklets";

import { duration } from "@/lib/motion";

import { IconButton } from "./header";

interface ImageViewerProps {
  uri?: string;
  visible: boolean;
  onClose: () => void;
}

const MAX_SCALE = 5;
const DOUBLE_TAP_SCALE = 2.5;
/** Dragging an unzoomed picture this far up or down closes the viewer. */
const CLOSE_DISTANCE = 120;

const styles = StyleSheet.create({
  close: { left: 8, position: "absolute" },
  image: { height: "100%", width: "100%" },
  root: { backgroundColor: "#000", flex: 1 },
});

/** Full-screen picture: pinch or double-tap to zoom, drag to look around, swipe down to close. */
const Viewer = ({ uri, onClose }: { uri?: string; onClose: () => void }) => {
  const insets = useSafeAreaInsets();
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const savedX = useSharedValue(0);
  const savedY = useSharedValue(0);

  const pinch = usePinchGesture({
    onDeactivate: () => {
      "worklet";
      if (scale.value <= 1) {
        scale.set(withTiming(1));
        x.set(withTiming(0));
        y.set(withTiming(0));
        savedX.set(0);
        savedY.set(0);
      }
      savedScale.set(Math.max(1, scale.value));
    },
    onUpdate: (event) => {
      "worklet";
      scale.set(Math.min(MAX_SCALE, Math.max(0.8, savedScale.value * event.scale)));
    },
  });

  const pan = usePanGesture({
    onDeactivate: (event) => {
      "worklet";
      if (savedScale.value > 1) {
        savedX.set(x.value);
        savedY.set(y.value);
        return;
      }
      if (Math.abs(event.translationY) > CLOSE_DISTANCE) {
        scheduleOnRN(onClose);
        return;
      }
      y.set(withTiming(0));
    },
    onUpdate: (event) => {
      "worklet";
      if (savedScale.value > 1) {
        x.set(savedX.value + event.translationX);
        y.set(savedY.value + event.translationY);
      } else {
        y.set(event.translationY);
      }
    },
  });

  const doubleTap = useTapGesture({
    numberOfTaps: 2,
    onActivate: () => {
      "worklet";
      const next = savedScale.value > 1 ? 1 : DOUBLE_TAP_SCALE;
      scale.set(withTiming(next));
      savedScale.set(next);
      x.set(withTiming(0));
      y.set(withTiming(0));
      savedX.set(0);
      savedY.set(0);
    },
  });

  const gesture = useSimultaneousGestures(pinch, pan, doubleTap);

  const imageStyle = useAnimatedStyle(() => ({
    opacity: savedScale.value > 1 ? 1 : 1 - Math.min(0.6, Math.abs(y.value) / (CLOSE_DISTANCE * 3)),
    transform: [{ translateX: x.value }, { translateY: y.value }, { scale: scale.value }],
  }));

  return (
    <GestureHandlerRootView style={styles.root}>
      <GestureDetector gesture={gesture}>
        <Animated.View style={[styles.image, imageStyle]}>
          <Image contentFit="contain" source={uri} style={styles.image} transition={duration.image} />
        </Animated.View>
      </GestureDetector>
      <View style={[styles.close, { top: insets.top + 8 }]}>
        <IconButton icon="close" label="Close" onPress={onClose} />
      </View>
    </GestureHandlerRootView>
  );
};

export const ImageViewer = ({ uri, visible, onClose }: ImageViewerProps) => (
  <Modal
    animationType="fade"
    navigationBarTranslucent
    onRequestClose={onClose}
    statusBarTranslucent
    transparent
    visible={visible}
  >
    {visible ? <Viewer onClose={onClose} uri={uri} /> : null}
  </Modal>
);
