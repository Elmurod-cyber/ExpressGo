import { createElement, forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Modal, Platform, Pressable, Text, View } from "react-native";
import { WebView } from "react-native-webview";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { MapPoint } from "../services/geo";
import { useT } from "../context/Session";
import { MAP_HTML, readPoint } from "./mapHtml";

export type MapPickerHandle = {
  show: (point: MapPoint) => void;
  showRoute: (line: MapPoint[]) => void;
};

type MapPickerProps = {
  onPick: (point: MapPoint) => void;
};

type FrameNode = {
  contentWindow: { postMessage: (data: string, origin: string) => void } | null;
};

function pushFrame(frame: FrameNode | null, web: WebView | null, point: MapPoint | null, line: MapPoint[] | null) {
  if (point) {
    if (Platform.OS === "web") frame?.contentWindow?.postMessage(JSON.stringify(point), "*");
    else web?.injectJavaScript(`setPoint(${point.lat}, ${point.lng}, true); true;`);
  }
  if (line && line.length >= 2) {
    const payload = JSON.stringify({ type: "route", line });
    if (Platform.OS === "web") frame?.contentWindow?.postMessage(payload, "*");
    else web?.injectJavaScript(`setRoute(${JSON.stringify(line)}); true;`);
  }
}

function MapFrame({
  point,
  line,
  fill,
  onPick,
}: {
  point: MapPoint | null;
  line: MapPoint[] | null;
  fill?: boolean;
  onPick?: (point: MapPoint) => void;
}) {
  const webRef = useRef<WebView>(null);
  const frameRef = useRef<FrameNode | null>(null);
  const ready = useRef(false);
  const pointRef = useRef(point);
  const lineRef = useRef(line);
  pointRef.current = point;
  lineRef.current = line;

  function flush() {
    if (!ready.current) return;
    pushFrame(frameRef.current, webRef.current, pointRef.current, lineRef.current);
  }

  useEffect(() => {
    flush();
  }, [point, line]);

  function markReady() {
    ready.current = true;
    flush();
  }

  if (Platform.OS === "web") {
    return (
      <View className={fill ? "min-h-[320px] flex-1" : "h-[220px]"} style={fill ? { flex: 1 } : undefined}>
        {createElement("iframe", {
          title: "Xarita",
          srcDoc: MAP_HTML,
          ref: frameRef,
          onLoad: markReady,
          style: { width: "100%", height: "100%", borderWidth: 0, minHeight: fill ? 320 : 220 },
        })}
      </View>
    );
  }

  return (
    <View className={fill ? "min-h-[320px] flex-1" : "h-[220px]"} style={fill ? { flex: 1 } : undefined}>
      <WebView
        ref={webRef}
        originWhitelist={["*"]}
        source={{ html: MAP_HTML }}
        onLoadEnd={markReady}
        onMessage={(event) => {
          if (!onPick) return;
          const picked = readPoint(event.nativeEvent.data);
          if (picked) onPick(picked);
        }}
        javaScriptEnabled
        scrollEnabled={false}
        nestedScrollEnabled
        style={{ flex: 1, backgroundColor: "#E8EEF5" }}
      />
    </View>
  );
}

export const MapPicker = forwardRef<MapPickerHandle, MapPickerProps>(function MapPicker({ onPick }, ref) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [point, setPoint] = useState<MapPoint | null>(null);
  const [line, setLine] = useState<MapPoint[] | null>(null);

  useImperativeHandle(ref, () => ({
    show(next) {
      setPoint(next);
    },
    showRoute(next) {
      setLine(next);
    },
  }));

  useEffect(() => {
    if (Platform.OS !== "web") return;
    function onMessage(event: { data: unknown }) {
      const picked = readPoint(event.data);
      if (picked) onPick(picked);
    }
    const target = globalThis as unknown as {
      addEventListener: (name: string, fn: (event: { data: unknown }) => void) => void;
      removeEventListener: (name: string, fn: (event: { data: unknown }) => void) => void;
    };
    target.addEventListener("message", onMessage);
    return () => target.removeEventListener("message", onMessage);
  }, [onPick]);

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={t("create.map_open")}
        className="h-[220px] overflow-hidden rounded-2xl bg-[#E8EEF5]"
      >
        <View pointerEvents="none" className="h-[220px]">
          <MapFrame point={point} line={line} />
        </View>
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <View className="flex-1 bg-black/40 pt-16">
          <View className="flex-1 rounded-t-[28px] bg-white px-4 pt-4" style={{ paddingBottom: Math.max(insets.bottom, 16) }}>
            <View className="flex-row items-center">
              <Text className="flex-1 pr-3 text-lg font-bold text-ink">{t("create.map_drag")}</Text>
              <Pressable onPress={() => setOpen(false)} accessibilityRole="button" accessibilityLabel={t("close")} className="p-1">
                <Ionicons name="close" size={22} color="#667085" />
              </Pressable>
            </View>
            <View className="mt-3 flex-1 overflow-hidden rounded-2xl bg-[#E8EEF5]">
              {open ? <MapFrame fill point={point} line={line} onPick={onPick} /> : null}
            </View>
            <Pressable
              onPress={() => setOpen(false)}
              accessibilityRole="button"
              className="mt-4 items-center rounded-2xl bg-brand py-3.5 active:opacity-90"
            >
              <Text className="text-base font-bold text-white">{t("create.map_done")}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
});
