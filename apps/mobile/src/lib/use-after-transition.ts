import { useNavigation } from "expo-router";
import type { NativeStackNavigationProp } from "expo-router/native-stack";
import type { ParamListBase } from "expo-router/react-navigation";
import { useEffect, useState } from "react";

/** If the screen has no slide-in (or the event never comes), draw the rest after this long. */
const FALLBACK_MS = 450;

/**
 * False while the screen is still sliding in, then true. Heavy parts of a screen (carousels,
 * long lists) wait for it, so the slide-in animation has the phone to itself and stays smooth.
 */
export const useAfterTransition = (): boolean => {
  const navigation = useNavigation<NativeStackNavigationProp<ParamListBase>>();
  const [done, setDone] = useState(false);
  useEffect(() => {
    const finish = () => {
      setDone(true);
    };
    const timer = setTimeout(finish, FALLBACK_MS);
    // native-stack emits transitionEnd once the push animation has finished.
    const unsubscribe = navigation.addListener("transitionEnd", finish);
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [navigation]);
  return done;
};
