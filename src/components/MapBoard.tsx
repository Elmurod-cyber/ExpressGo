import { createElement, useEffect, useRef } from "react";
import { Platform, View } from "react-native";
import { WebView } from "react-native-webview";
import type { MapPin } from "../types";
import { MAP_BOARD_HTML } from "./mapBoardHtml";

type FrameNode = {
  contentWindow: { postMessage: (data: string, origin: string) => void } | null;
};

export function MapBoard({ pins, height = 240, fill = false }: { pins: MapPin[]; height?: number; fill?: boolean }) {
  const webRef = useRef<WebView>(null);
  const frameRef = useRef<FrameNode | null>(null);
  const payload = JSON.stringify({ pins });

  useEffect(() => {
    if (Platform.OS === "web") {
      frameRef.current?.contentWindow?.postMessage(payload, "*");
      return;
    }
    webRef.current?.injectJavaScript(`setPins(${payload}); true;`);
  }, [payload]);

  const box = fill ? "flex-1 bg-[#E8EEF5]" : "overflow-hidden rounded-2xl bg-[#E8EEF5]";

  if (Platform.OS === "web") {
    return (
      <View className={box} style={fill ? { flex: 1, minHeight: 320 } : { height }}>
        {createElement("iframe", {
          title: "Xarita",
          srcDoc: MAP_BOARD_HTML,
          ref: frameRef,
          onLoad: () => frameRef.current?.contentWindow?.postMessage(payload, "*"),
          style: { width: "100%", height: fill ? "100%" : height, borderWidth: 0, minHeight: fill ? 320 : height },
        })}
      </View>
    );
  }

  return (
    <View className={box} style={fill ? { flex: 1 } : { height }}>
      <WebView
        ref={webRef}
        originWhitelist={["*"]}
        source={{ html: MAP_BOARD_HTML }}
        onLoadEnd={() => {
          webRef.current?.injectJavaScript(`setPins(${payload}); true;`);
        }}
        javaScriptEnabled
        scrollEnabled={false}
        style={{ flex: 1, height: fill ? undefined : height, backgroundColor: "transparent" }}
      />
    </View>
  );
}
