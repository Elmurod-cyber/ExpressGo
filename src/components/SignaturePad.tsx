import { createElement, useEffect, useRef } from "react";
import { Modal, Platform, Pressable, Text, View } from "react-native";
import { WebView } from "react-native-webview";
import { SIGNATURE_HTML } from "./signatureHtml";

type SignaturePadProps = {
  visible: boolean;
  onCancel: () => void;
  onDone: (uri: string) => void;
};

type FrameNode = {
  contentWindow: { postMessage: (data: string, origin: string) => void } | null;
};

export function SignaturePad({ visible, onCancel, onDone }: SignaturePadProps) {
  const webRef = useRef<WebView>(null);
  const frameRef = useRef<FrameNode | null>(null);

  useEffect(() => {
    if (Platform.OS !== "web" || !visible) return;
    function onMessage(event: { data: unknown }) {
      if (typeof event.data === "string" && event.data.startsWith("data:image")) {
        onDone(event.data);
      }
    }
    const target = globalThis as unknown as {
      addEventListener: (name: string, fn: (event: { data: unknown }) => void) => void;
      removeEventListener: (name: string, fn: (event: { data: unknown }) => void) => void;
    };
    target.addEventListener("message", onMessage);
    return () => target.removeEventListener("message", onMessage);
  }, [visible, onDone]);

  function clear() {
    if (Platform.OS === "web") {
      frameRef.current?.contentWindow?.postMessage("clear", "*");
      return;
    }
    webRef.current?.injectJavaScript("clearPad(); true;");
  }

  function save() {
    if (Platform.OS === "web") {
      frameRef.current?.contentWindow?.postMessage("save", "*");
      return;
    }
    webRef.current?.injectJavaScript("sendPad(); true;");
  }

  const pad =
    Platform.OS === "web"
      ? createElement("iframe", {
          title: "Imzo",
          srcDoc: SIGNATURE_HTML,
          ref: frameRef,
          style: { width: "100%", height: 180, borderWidth: 0, borderRadius: 16 },
        })
      : (
          <WebView
            ref={webRef}
            originWhitelist={["*"]}
            source={{ html: SIGNATURE_HTML }}
            onMessage={(event) => {
              const data = event.nativeEvent.data;
              if (typeof data === "string" && data.startsWith("data:image")) onDone(data);
            }}
            javaScriptEnabled
            scrollEnabled={false}
            style={{ height: 180, borderRadius: 16 }}
          />
        );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View className="flex-1 justify-end bg-black/40">
        <View className="rounded-t-[28px] bg-card px-4 pb-6 pt-4">
          <Text className="text-lg font-bold text-ink">Mijoz imzosi</Text>
          <Text className="mt-1 text-sm text-muted">Barmoq bilan chizing. Ixtiyoriy.</Text>
          <View className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-card">{pad}</View>
          <View className="mt-4 flex-row">
            <Pressable onPress={clear} accessibilityRole="button" className="flex-1 items-center rounded-2xl border border-slate-200 py-3">
              <Text className="text-sm font-semibold text-muted">Tozalash</Text>
            </Pressable>
            <View className="w-2" />
            <Pressable onPress={onCancel} accessibilityRole="button" className="flex-1 items-center rounded-2xl border border-slate-200 py-3">
              <Text className="text-sm font-semibold text-muted">O'tkazib yuborish</Text>
            </Pressable>
          </View>
          <Pressable onPress={save} accessibilityRole="button" className="mt-2 items-center rounded-2xl bg-brand py-3.5 active:opacity-90">
            <Text className="text-base font-bold text-white">Imzoni saqlash</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
