import { Image } from "react-native";

const logo = require("../../assets/brand/logo.jpg");

/** To'q sariq Express Go belgisi. */
export function BrandMark({ size = 52 }: { size?: number }) {
  return (
    <Image
      source={logo}
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.22) }}
      resizeMode="cover"
      accessibilityLabel="Express Go"
    />
  );
}

/** To'liq kvadrat logo. */
export function BrandLogo({ width }: { width: number }) {
  return (
    <Image
      source={logo}
      style={{ width, height: width, borderRadius: Math.round(width * 0.22) }}
      resizeMode="cover"
      accessibilityLabel="Express Go"
    />
  );
}
