import { useEffect, useState } from "react";
import { Dimensions, Keyboard, type KeyboardEvent, type NativeMethods, Platform, type ScrollView, TextInput } from "react-native";

function focusedField(): NativeMethods | null {
  const state = (TextInput as { State?: { currentlyFocusedInput?: () => NativeMethods | null } }).State;
  const node = state?.currentlyFocusedInput?.() ?? null;
  if (node && typeof node.measureInWindow === "function") return node;
  return null;
}

export function useKeyboardOverlap(): number {
  const [overlap, setOverlap] = useState(0);
  useEffect(() => {
    const full = { height: Dimensions.get("window").height };
    const showName = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideName = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const show = Keyboard.addListener(showName, (event) => {
      const windowH = Dimensions.get("window").height;
      full.height = Math.max(full.height, windowH);
      const shrunk = Math.max(0, full.height - windowH);
      setOverlap(Math.max(0, Math.round(event.endCoordinates.height - shrunk)));
    });
    const hide = Keyboard.addListener(hideName, () => {
      full.height = Dimensions.get("window").height;
      setOverlap(0);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return overlap;
}

export function keyboardFrameTop(event: KeyboardEvent): number {
  const top = event.endCoordinates.screenY;
  if (top > 0) return top;
  return Dimensions.get("window").height - event.endCoordinates.height;
}

export function liftAboveKeyboard(scroll: ScrollView | null, scrollY: number, frameTop: number, extraBelow = 0) {
  const node = focusedField();
  if (!scroll || !node || frameTop <= 0) return;
  node.measureInWindow((_x, y, _width, height) => {
    const bottom = y + height + extraBelow;
    const limit = frameTop - 16;
    if (bottom <= limit) return;
    scroll.scrollTo({ y: Math.max(0, scrollY + bottom - limit), animated: true });
  });
}
