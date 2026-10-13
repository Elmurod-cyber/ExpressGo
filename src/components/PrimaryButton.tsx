import { Pressable, Text } from "react-native";

type PrimaryButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
};

export function PrimaryButton({ label, onPress, disabled = false }: PrimaryButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      className={`items-center rounded-2xl py-4 ${disabled ? "bg-slate-200" : "bg-brand active:opacity-90"}`}
    >
      <Text className={`text-base font-semibold ${disabled ? "text-slate-500" : "text-white"}`}>
        {label}
      </Text>
    </Pressable>
  );
}
