// apps/mobile/src/screens/ToolboxScreen.tsx
//
// Ported from apps/wallet/src/views/ToolboxView.vue.
//
// Ported 1:1. The three tool cards, the five-step Coin Split Helper wizard
// (activeStep/clamp logic, per-step panels, Previous/Next disable states), and
// the safety footnotes all carry over verbatim.
//
// Platform substitutions, no logic loss:
//   • `navigator.clipboard.writeText` -> Clipboard.setString, still wrapped in
//     the same try/catch and 2s "Copied" reset via setTimeout.
//   • The `<select>`-free, input-free wizard is presentation only; the two
//     disabled inputs in Step 3 are rendered as static read-only rows.
//   • The `aria-label="Coin split steps"` nav is preserved as
//     accessibilityLabel on the wizard container.
//   • The Vue grid classes list the wizard nav and panel side-by-side at lg;
//     on a phone they stack, so RN renders them vertically always.

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Clipboard from "@react-native-clipboard/clipboard";

import { ECASH, GRAY } from "../theme/colors";
import {
  Badge,
  Body,
  Button,
  Card,
  Eyebrow,
  Mono,
  Muted,
  Title,
} from "../components/ui";

const mockBtcAddress = "bc1q-sidecoin-split-staging-address-preview";

const tools = [
  {
    name: "Coin Split Helper",
    status: "Featured",
    description:
      "Guided BTC/eCash fork split flow using a wallet-generated BTC staging address and the current eCash wallet.",
  },
  {
    name: "Address Inspector",
    status: "Planned",
    description:
      "Inspect address format, network, and derivation assumptions before sending.",
  },
  {
    name: "Transaction Decoder",
    status: "Planned",
    description:
      "Paste raw transaction hex to decode outputs, fees, and chain assumptions.",
  },
];

const wizardSteps = [
  {
    title: "Generate BTC staging address",
    eyebrow: "Step 1",
    summary:
      "Create a wallet-controlled BTC address for the coins you want to split.",
  },
  {
    title: "Detect funding",
    eyebrow: "Step 2",
    summary: "Track confirmations and prepare selected UTXOs for review.",
  },
  {
    title: "Confirm destinations",
    eyebrow: "Step 3",
    summary:
      "Send eCash to this wallet and BTC to a return address you control.",
  },
  {
    title: "Review split plan",
    eyebrow: "Step 4",
    summary: "Review outputs, fees, labels, and raw transaction details.",
  },
  {
    title: "Sign and export",
    eyebrow: "Step 5",
    summary: "Sign locally, export transaction hex, and broadcast when ready.",
  },
];

export function ToolboxScreen(): React.JSX.Element {
  const [activeStep, setActiveStep] = useState(0);
  const [copied, setCopied] = useState(false);

  const currentStep = wizardSteps[activeStep];

  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    },
    [],
  );

  const goToStep = useCallback((index: number) => {
    setActiveStep(index);
  }, []);

  const nextStep = useCallback(() => {
    setActiveStep((i) => Math.min(i + 1, wizardSteps.length - 1));
  }, []);

  const previousStep = useCallback(() => {
    setActiveStep((i) => Math.max(i - 1, 0));
  }, []);

  const copyAddress = useCallback(() => {
    try {
      Clipboard.setString(mockBtcAddress);
      setCopied(true);
      copiedTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error("[ToolboxScreen] Failed to copy split staging address:", e);
    }
  }, []);

  return (
    <View style={styles.root}>
      <View>
        <Eyebrow>Wallet utilities</Eyebrow>
        <Title>Toolbox</Title>
        <Body style={styles.intro}>
          Practical wallet-native tools for fork safety, address inspection, and
          transaction workflows. The first priority is helping users split coins
          safely after the BTC/eCash fork.
        </Body>
      </View>

      <View style={styles.toolGrid}>
        {tools.map((tool) => (
          <Card key={tool.name} style={styles.toolCard}>
            <View style={styles.toolHead}>
              <Text style={styles.toolName}>{tool.name}</Text>
              <Badge
                label={tool.status}
                tone={tool.status === "Featured" ? "active" : "neutral"}
              />
            </View>
            <Muted style={styles.toolDescription}>{tool.description}</Muted>
          </Card>
        ))}
      </View>

      <Card tone="accent" style={styles.splitSection}>
        <View style={styles.splitHead}>
          <View style={styles.splitHeadCopy}>
            <Text style={styles.splitTitle}>Coin Split Helper</Text>
            <Muted style={styles.splitIntro}>
              Guided wallet-native split workflow using this wallet's local
              keystore, wallet-controlled UTXOs, explicit coin selection, and full
              transaction review.
            </Muted>
          </View>
          <Badge label="Guided" tone="active" />
        </View>

        <View
          style={styles.wizard}
          accessibilityLabel="Coin split steps"
        >
          {/* Wizard nav */}
          <View style={styles.wizardNav}>
            {wizardSteps.map((step, i) => {
              const isActive = activeStep === i;
              return (
                <Pressable
                  key={step.title}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}
                  onPress={() => goToStep(i)}
                  style={[
                    styles.wizardNavItem,
                    isActive ? styles.wizardNavItemActive : null,
                  ]}
                >
                  <View style={styles.wizardNavHead}>
                    <View
                      style={[
                        styles.stepBadge,
                        isActive ? styles.stepBadgeActive : null,
                      ]}
                    >
                      <Text
                        style={[
                          styles.stepBadgeText,
                          isActive ? styles.stepBadgeTextActive : null,
                        ]}
                      >
                        {i + 1}
                      </Text>
                    </View>
                    <View style={styles.wizardNavCopy}>
                      <Text style={styles.stepEyebrow}>{step.eyebrow}</Text>
                      <Text style={styles.stepTitle}>{step.title}</Text>
                    </View>
                  </View>
                  <Text style={styles.stepSummary}>{step.summary}</Text>
                </Pressable>
              );
            })}
          </View>

          {/* Wizard panel */}
          <View style={styles.wizardPanel}>
            <Text style={styles.panelEyebrow}>{currentStep.eyebrow}</Text>
            <Text style={styles.panelTitle}>{currentStep.title}</Text>
            <Text style={styles.panelSummary}>{currentStep.summary}</Text>

            {/* Step 1 */}
            {activeStep === 0 ? (
              <View style={styles.step1}>
                <Card tone="inset" style={styles.qrCard}>
                  <View style={styles.qrPlaceholder}>
                    <Text style={styles.qrPlaceholderText}>Funding QR</Text>
                  </View>
                  <Muted style={styles.qrCaption}>
                    Scan to fund split address
                  </Muted>
                </Card>

                <View style={styles.step1Address}>
                  <Text style={styles.fieldLabel}>BTC staging address</Text>
                  <View style={styles.addressBox}>
                    <Text style={styles.addressText}>{mockBtcAddress}</Text>
                  </View>
                  <Button
                    label={copied ? "Copied ✓" : "Copy address"}
                    variant="secondary"
                    size="sm"
                    onPress={copyAddress}
                    style={styles.copyAddress}
                  />
                </View>
              </View>
            ) : null}

            {/* Step 2 */}
            {activeStep === 1 ? (
              <View style={styles.stepGrid}>
                <Card tone="inset" style={styles.stepTile}>
                  <Muted style={styles.stepTileLabel}>Funding status</Muted>
                  <Text style={styles.stepTileValue}>Watching address</Text>
                </Card>
                <Card tone="inset" style={styles.stepTile}>
                  <Muted style={styles.stepTileLabel}>Confirmations</Muted>
                  <Text style={styles.stepTileValue}>Tracked automatically</Text>
                </Card>
                <Card tone="inset" style={styles.stepTile}>
                  <Muted style={styles.stepTileLabel}>UTXO selection</Muted>
                  <Text style={styles.stepTileValue}>User controlled</Text>
                </Card>
              </View>
            ) : null}

            {/* Step 3 */}
            {activeStep === 2 ? (
              <View style={styles.step3}>
                <View>
                  <Text style={styles.fieldLabel}>eCash destination</Text>
                  <View style={styles.disabledInput}>
                    <Text style={styles.disabledInputText}>
                      Current eCash wallet
                    </Text>
                  </View>
                  <Muted style={styles.fieldHint}>
                    The eCash side of the split is directed into the current
                    wallet.
                  </Muted>
                </View>

                <View>
                  <Text style={styles.fieldLabel}>BTC return address</Text>
                  <View style={styles.disabledInput}>
                    <Text style={styles.disabledPlaceholder}>
                      BTC address you control
                    </Text>
                  </View>
                  <Muted style={styles.fieldHint}>
                    Confirm a BTC return address you control before continuing.
                  </Muted>
                </View>

                <View style={styles.warningBox}>
                  <Text style={styles.warningText}>
                    If funds came from an exchange, custodian, or change output,
                    choose a safe BTC destination before continuing.
                  </Text>
                </View>
              </View>
            ) : null}

            {/* Step 4 */}
            {activeStep === 3 ? (
              <View style={styles.stepGrid}>
                <Card tone="inset" style={styles.stepTile}>
                  <Text style={styles.stepTileEyebrow}>Review</Text>
                  <View style={styles.checkList}>
                    {[
                      "Selected inputs",
                      "BTC return output",
                      "eCash wallet output",
                      "Network fees",
                    ].map((item) => (
                      <Text key={item} style={styles.checkItem}>
                        ✓ {item}
                      </Text>
                    ))}
                  </View>
                </Card>
                <Card tone="inset" style={styles.stepTile}>
                  <Text style={styles.stepTileEyebrow}>Safety</Text>
                  <View style={styles.checkList}>
                    {[
                      "Chain labels",
                      "Destination confirmation",
                      "Raw transaction preview",
                      "Replay checks",
                    ].map((item) => (
                      <Text key={item} style={styles.checkItem}>
                        ✓ {item}
                      </Text>
                    ))}
                  </View>
                </Card>
              </View>
            ) : null}

            {/* Step 5 */}
            {activeStep === 4 ? (
              <Card tone="inset" style={styles.step5}>
                <Text style={styles.step5Title}>Ready for local signing</Text>
                <Muted style={styles.step5Body}>
                  The final step signs locally, lets the user export raw
                  transaction hex, and provides broadcast status through the
                  configured adapter.
                </Muted>
              </Card>
            ) : null}

            <View style={styles.wizardFooter}>
              <Button
                label="Previous"
                variant="secondary"
                size="sm"
                disabled={activeStep === 0}
                onPress={previousStep}
              />
              <Button
                label="Next step"
                size="sm"
                disabled={activeStep === wizardSteps.length - 1}
                onPress={nextStep}
              />
            </View>
          </View>
        </View>

        <View style={styles.footnote}>
          <Mono style={styles.footnoteText}>
            Coin splitting should use this wallet's local keystore,
            wallet-controlled UTXOs, explicit coin selection, and full
            transaction review. Do not paste your seed phrase into a separate
            website or third-party tool.
          </Mono>
        </View>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    gap: 24,
  },
  intro: {
    marginTop: 8,
  },
  toolGrid: {
    gap: 16,
  },
  toolCard: {
    padding: 16,
  },
  toolHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  toolName: {
    flexShrink: 1,
    fontWeight: "600",
    color: "#ffffff",
  },
  toolDescription: {
    marginTop: 8,
    fontSize: 13,
  },
  splitSection: {
    padding: 20,
  },
  splitHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  splitHeadCopy: {
    flexShrink: 1,
  },
  splitTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: ECASH[400],
  },
  splitIntro: {
    marginTop: 8,
    fontSize: 13,
  },
  wizard: {
    marginTop: 24,
    gap: 20,
  },
  wizardNav: {
    gap: 8,
  },
  wizardNavItem: {
    borderWidth: 1,
    borderColor: GRAY[800],
    borderRadius: 12,
    backgroundColor: GRAY[950],
    padding: 16,
  },
  wizardNavItemActive: {
    borderColor: ECASH[600],
    backgroundColor: GRAY[900],
  },
  wizardNavHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  stepBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: GRAY[800],
    alignItems: "center",
    justifyContent: "center",
  },
  stepBadgeActive: {
    backgroundColor: ECASH[500],
  },
  stepBadgeText: {
    fontSize: 13,
    fontWeight: "900",
    color: GRAY[400],
  },
  stepBadgeTextActive: {
    color: GRAY[950],
  },
  wizardNavCopy: {
    flexShrink: 1,
  },
  stepEyebrow: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 2,
    color: GRAY[500],
  },
  stepTitle: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: "600",
    color: "#ffffff",
  },
  stepSummary: {
    marginTop: 12,
    fontSize: 11,
    lineHeight: 18,
    color: GRAY[500],
  },
  wizardPanel: {
    borderWidth: 1,
    borderColor: GRAY[800],
    borderRadius: 12,
    backgroundColor: GRAY[950],
    padding: 20,
  },
  panelEyebrow: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 2,
    color: ECASH[500],
  },
  panelTitle: {
    marginTop: 4,
    fontSize: 20,
    fontWeight: "900",
    color: "#ffffff",
  },
  panelSummary: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 22,
    color: GRAY[400],
  },
  step1: {
    marginTop: 20,
    gap: 16,
  },
  qrCard: {
    height: 200,
    alignItems: "center",
    justifyContent: "center",
  },
  qrPlaceholder: {
    width: 128,
    height: 128,
    borderRadius: 4,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  qrPlaceholderText: {
    fontSize: 11,
    fontWeight: "900",
    color: GRAY[950],
  },
  qrCaption: {
    marginTop: 8,
    fontSize: 11,
  },
  step1Address: {
    flexShrink: 1,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 2,
    color: GRAY[500],
  },
  addressBox: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: GRAY[800],
    borderRadius: 4,
    backgroundColor: GRAY[900],
    padding: 12,
  },
  addressText: {
    fontFamily: "monospace",
    fontSize: 11,
    color: ECASH[400],
  },
  copyAddress: {
    marginTop: 12,
    alignSelf: "flex-start",
  },
  stepGrid: {
    marginTop: 20,
    gap: 12,
  },
  stepTile: {
    padding: 16,
  },
  stepTileLabel: {
    fontSize: 11,
  },
  stepTileValue: {
    marginTop: 8,
    fontWeight: "600",
    color: "#ffffff",
  },
  stepTileEyebrow: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 2,
    color: GRAY[500],
  },
  checkList: {
    marginTop: 12,
    gap: 8,
  },
  checkItem: {
    fontSize: 13,
    color: GRAY[300],
  },
  step3: {
    marginTop: 20,
    gap: 16,
  },
  disabledInput: {
    marginTop: 4,
    borderWidth: 1,
    borderColor: GRAY[700],
    borderRadius: 4,
    backgroundColor: GRAY[900],
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  disabledInputText: {
    fontSize: 13,
    color: GRAY[400],
  },
  disabledPlaceholder: {
    fontSize: 13,
    color: GRAY[500],
  },
  fieldHint: {
    marginTop: 4,
    fontSize: 11,
    color: GRAY[600],
  },
  warningBox: {
    borderWidth: 1,
    borderColor: "#b45309",
    borderRadius: 8,
    backgroundColor: "rgba(120,53,15,0.3)",
    padding: 12,
  },
  warningText: {
    fontSize: 11,
    color: "#fbbf24",
  },
  step5: {
    marginTop: 20,
    padding: 16,
  },
  step5Title: {
    fontWeight: "600",
    color: "#ffffff",
  },
  step5Body: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 22,
  },
  wizardFooter: {
    marginTop: 24,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: GRAY[800],
    paddingTop: 16,
  },
  footnote: {
    marginTop: 20,
    borderWidth: 1,
    borderColor: "#854d0e",
    borderRadius: 8,
    backgroundColor: "rgba(66,32,6,0.3)",
    padding: 12,
  },
  footnoteText: {
    fontSize: 11,
    lineHeight: 18,
    color: "#eab308",
  },
});
