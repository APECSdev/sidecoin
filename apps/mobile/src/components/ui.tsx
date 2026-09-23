// apps/mobile/src/components/ui.tsx
//
// Shared React Native UI primitives for the Sidecoin wallet.
//
// The Vue views are styled with Tailwind utility classes (bg-gray-900,
// rounded-2xl, text-ecash-400, …). React Native has no CSS cascade, so these
// primitives reproduce the SAME visual language with StyleSheet objects:
//   • gray-900 / gray-950 surfaces      -> card / inset surfaces
//   • ecash-400 / ecash-500 accents      -> ECASH palette
//   • rounded-xl / rounded-2xl / rounded-full
//   • text-xs uppercase tracking-widest  (eyebrow labels)
//
// Every screen in apps/mobile/src/screens is built from these, so a styling
// change made here propagates the way a Tailwind class change did in the
// Vue app. No behaviour lives here — presentation only.

import React from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ECASH, GRAY, SC } from "../theme/colors";

// ──────────────────────────────────────────────────────
// Screen shell — the per-view <div> root.
// ──────────────────────────────────────────────────────
export interface ScreenProps {
  children: React.ReactNode;
  /** Center the content column (the Vue `mx-auto max-w-*` wrapper). */
  centered?: boolean;
  style?: StyleProp<ViewStyle>;
  /** False for screens that manage their own scrolling (e.g. with a list). */
  scroll?: boolean;
}

export function Screen({
  children,
  centered = false,
  style,
  scroll = true,
}: ScreenProps): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const contentStyle: StyleProp<ViewStyle> = [
    styles.screenContent,
    centered ? styles.screenContentCentered : null,
    style,
  ];

  if (!scroll) {
    return <View style={[styles.screen, contentStyle]}>{children}</View>;
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        contentStyle,
        { paddingBottom: insets.bottom + 24 },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

// ──────────────────────────────────────────────────────
// Card — rounded border + surface background.
//   tone: "surface" (gray-900) | "inset" (gray-950) | "pro" (amber) | "accent"
// ──────────────────────────────────────────────────────
export type CardTone = "surface" | "inset" | "pro" | "accent";

export interface CardProps {
  children: React.ReactNode;
  tone?: CardTone;
  style?: StyleProp<ViewStyle>;
}

const CARD_TONE: Record<CardTone, ViewStyle> = {
  surface: { backgroundColor: GRAY[900], borderColor: GRAY[800] },
  inset: { backgroundColor: GRAY[950], borderColor: GRAY[800] },
  pro: { backgroundColor: "#1a1206", borderColor: "#f59e0b66" },
  accent: { backgroundColor: "#052e16", borderColor: ECASH[800] },
};

export function Card({ children, tone = "surface", style }: CardProps): React.JSX.Element {
  return <View style={[styles.card, CARD_TONE[tone], style]}>{children}</View>;
}

// ──────────────────────────────────────────────────────
// Text roles — eyebrow / title / subtitle / body / muted / mono / detail.
// ──────────────────────────────────────────────────────
export interface TextRoleProps {
  children: React.ReactNode;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  selectable?: boolean;
}

export function Eyebrow({ children, style }: TextRoleProps): React.JSX.Element {
  return <Text style={[styles.eyebrow, style]}>{children}</Text>;
}

export function Title({ children, style }: TextRoleProps): React.JSX.Element {
  return <Text style={[styles.title, style]}>{children}</Text>;
}

export function Subtitle({ children, style }: TextRoleProps): React.JSX.Element {
  return <Text style={[styles.subtitle, style]}>{children}</Text>;
}

export function Body({ children, style }: TextRoleProps): React.JSX.Element {
  return <Text style={[styles.body, style]}>{children}</Text>;
}

export function Muted({ children, style }: TextRoleProps): React.JSX.Element {
  return <Text style={[styles.muted, style]}>{children}</Text>;
}

export function Mono({
  children,
  style,
  selectable,
}: TextRoleProps): React.JSX.Element {
  return (
    <Text selectable={selectable} style={[styles.mono, style]}>
      {children}
    </Text>
  );
}

/** Section heading (fontSize 16/18, weight 600, white). */
export function SectionTitle({ children, style }: TextRoleProps): React.JSX.Element {
  return <Text style={[styles.sectionTitle, style]}>{children}</Text>;
}

// ──────────────────────────────────────────────────────
// Badge / Pill — the rounded status chips.
// ──────────────────────────────────────────────────────
export type BadgeTone =
  | "active"
  | "proposed"
  | "pro"
  | "neutral"
  | "danger"
  | "warning";

export interface BadgeProps {
  label: string;
  tone?: BadgeTone;
  style?: StyleProp<ViewStyle>;
}

const BADGE_TONE: Record<BadgeTone, { bg: string; fg: string }> = {
  active: { bg: ECASH[900], fg: ECASH[400] },
  proposed: { bg: GRAY[800], fg: GRAY[500] },
  pro: { bg: "#f59e0b", fg: GRAY[950] },
  neutral: { bg: GRAY[800], fg: GRAY[400] },
  danger: { bg: "#7f1d1d", fg: "#fca5a5" },
  warning: { bg: "#78350f", fg: "#fcd34d" },
};

export function Badge({ label, tone = "neutral", style }: BadgeProps): React.JSX.Element {
  const colors = BADGE_TONE[tone];
  return (
    <View style={[styles.badge, { backgroundColor: colors.bg }, style]}>
      <Text style={[styles.badgeText, { color: colors.fg }]}>{label}</Text>
    </View>
  );
}

// ──────────────────────────────────────────────────────
// Button — primary (ecash-500/600) | secondary (bordered) | pro (amber).
// ──────────────────────────────────────────────────────
export type ButtonVariant = "primary" | "secondary" | "pro" | "ghost";
export type ButtonSize = "sm" | "md";

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  fullWidth?: boolean;
}

const BUTTON_VARIANT: Record<ButtonVariant, { bg: string; fg: string; border: string }> = {
  primary: { bg: ECASH[600], fg: "#ffffff", border: "transparent" },
  secondary: { bg: GRAY[900], fg: GRAY[200], border: GRAY[700] },
  pro: { bg: "#f59e0b", fg: GRAY[950], border: "transparent" },
  ghost: { bg: "transparent", fg: GRAY[300], border: GRAY[800] },
};

export function Button({
  label,
  onPress,
  variant = "primary",
  size = "md",
  disabled = false,
  loading = false,
  style,
  fullWidth = false,
}: ButtonProps): React.JSX.Element {
  const colors = BUTTON_VARIANT[variant];
  const isDisabled = disabled || loading;
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled }}
      activeOpacity={0.8}
      disabled={isDisabled}
      onPress={onPress}
      style={[
        styles.button,
        size === "sm" ? styles.buttonSm : styles.buttonMd,
        {
          backgroundColor: colors.bg,
          borderColor: colors.border,
        },
        fullWidth ? styles.buttonFull : null,
        isDisabled ? styles.buttonDisabled : null,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors.fg} size="small" />
      ) : (
        <Text style={[styles.buttonText, size === "sm" ? styles.buttonTextSm : null, { color: colors.fg }]}>
          {label}
        </Text>
      )}
    </TouchableOpacity>
  );
}

// ──────────────────────────────────────────────────────
// Field — a labelled TextInput (block label + input box).
// ──────────────────────────────────────────────────────
export interface FieldProps {
  label: string;
  value: string;
  onChangeText?: (value: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  multiline?: boolean;
  editable?: boolean;
  keyboardType?: "default" | "decimal-pad" | "numeric" | "email-address";
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  hint?: string;
  /** Small helper text under the input (Vue `text-xs text-gray-600`). */
  footer?: string;
  style?: StyleProp<ViewStyle>;
}

export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry = false,
  multiline = false,
  editable = true,
  keyboardType = "default",
  autoCapitalize = "none",
  hint,
  footer,
  style,
}: FieldProps): React.JSX.Element {
  return (
    <View style={[styles.field, style]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={GRAY[600]}
        secureTextEntry={secureTextEntry}
        multiline={multiline}
        editable={editable}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        style={[
          styles.input,
          multiline ? styles.inputMultiline : null,
          !editable ? styles.inputDisabled : null,
        ]}
      />
      {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
      {footer ? <Text style={styles.fieldFooter}>{footer}</Text> : null}
    </View>
  );
}

// ──────────────────────────────────────────────────────
// Alert — the coloured info/warning/error banners.
// ──────────────────────────────────────────────────────
export type AlertTone = "info" | "warning" | "error" | "success";

export interface AlertProps {
  tone?: AlertTone;
  title?: string;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

const ALERT_TONE: Record<AlertTone, { bg: string; border: string; fg: string }> = {
  info: { bg: "#0c1a2b", border: "#1e40af66", fg: "#93c5fd" },
  warning: { bg: "#1a1206", border: "#92400e66", fg: "#fcd34d" },
  error: { bg: "#2a0d0d", border: "#991b1b66", fg: "#fca5a5" },
  success: { bg: "#052e16", border: "#16653466", fg: ECASH[400] },
};

export function Alert({
  tone = "info",
  title,
  children,
  style,
}: AlertProps): React.JSX.Element {
  const colors = ALERT_TONE[tone];
  return (
    <View
      style={[
        styles.alert,
        { backgroundColor: colors.bg, borderColor: colors.border },
        style,
      ]}
    >
      {title ? (
        <Text style={[styles.alertTitle, { color: colors.fg }]}>{title}</Text>
      ) : null}
      <View>{typeof children === "string" ? (
        <Text style={[styles.alertBody, { color: colors.fg }]}>{children}</Text>
      ) : (
        children
      )}</View>
    </View>
  );
}

// ──────────────────────────────────────────────────────
// Loading line — the "Loading …" / "…" placeholders.
// ──────────────────────────────────────────────────────
export function Loading({ label = "Loading…" }: { label?: string }): React.JSX.Element {
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={SC.primary} />
      <Text style={styles.muted}>{label}</Text>
    </View>
  );
}

/** A key/value row used across detail panels (`flex justify-between`). */
export function DetailRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}): React.JSX.Element {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <View style={styles.detailValue}>
        {typeof value === "string" ? (
          <Text style={styles.detailValueText}>{value}</Text>
        ) : (
          value
        )}
      </View>
    </View>
  );
}

/** A small inset stat tile (`rounded-lg border bg-gray-900 p-3`). */
export function StatTile({
  label,
  value,
  mono = false,
  style,
}: {
  label: string;
  value: string;
  mono?: boolean;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  return (
    <View style={[styles.statTile, style]}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, mono ? styles.mono : null]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: SC.bg,
  },
  screenContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  screenContentCentered: {
    alignSelf: "center",
    width: "100%",
  },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1.2,
    color: ECASH[500],
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: SC.text,
    marginTop: 4,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: GRAY[400],
    marginTop: 8,
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
    color: GRAY[300],
  },
  muted: {
    fontSize: 13,
    lineHeight: 18,
    color: GRAY[500],
  },
  mono: {
    fontFamily: "monospace",
    fontSize: 13,
    color: GRAY[300],
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: SC.text,
    marginBottom: 8,
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  button: {
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonMd: {
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  buttonSm: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  buttonFull: {
    width: "100%",
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: "700",
  },
  buttonTextSm: {
    fontSize: 12,
  },
  field: {
    marginBottom: 12,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    color: GRAY[500],
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: GRAY[700],
    borderRadius: 10,
    backgroundColor: GRAY[900],
    color: SC.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  inputMultiline: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  inputDisabled: {
    color: GRAY[500],
    backgroundColor: GRAY[950],
  },
  fieldHint: {
    fontSize: 12,
    color: GRAY[500],
    marginTop: 4,
  },
  fieldFooter: {
    fontSize: 11,
    color: GRAY[600],
    marginTop: 4,
  },
  alert: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
  },
  alertTitle: {
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 4,
  },
  alertBody: {
    fontSize: 13,
    lineHeight: 18,
  },
  loading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 6,
  },
  detailLabel: {
    fontSize: 13,
    color: GRAY[400],
  },
  detailValue: {
    flexShrink: 1,
    alignItems: "flex-end",
  },
  detailValueText: {
    fontSize: 13,
    color: GRAY[200],
    textAlign: "right",
  },
  statTile: {
    borderWidth: 1,
    borderColor: GRAY[800],
    borderRadius: 10,
    backgroundColor: GRAY[900],
    padding: 12,
    flex: 1,
  },
  statLabel: {
    fontSize: 11,
    color: GRAY[500],
  },
  statValue: {
    fontSize: 14,
    fontWeight: "600",
    color: SC.text,
    marginTop: 4,
  },
});
