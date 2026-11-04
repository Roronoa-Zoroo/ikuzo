import { TRACKER_LABELS, TRACKERS } from "@ikuzo/anime/trackers";
import type { RemoteEntry, TrackerId } from "@ikuzo/anime/trackers";
import { Image } from "expo-image";
import { useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, TextInput, View } from "react-native";

import { groupHeld, useAccounts } from "@/lib/accounts";
import type { HoldReason } from "@/lib/accounts";
import {
  approveHeld,
  connect,
  disconnect,
  discardHeld,
  importPublicList,
  pendingFor,
  previewPublicList,
  pull,
} from "@/lib/sync";
import type { PullSummary } from "@/lib/sync";
import { colors, fontSize, radius, spacing, fontFamily } from "@/lib/theme";
import { useNow } from "@/lib/use-now";

import { ChipRow } from "./chips";
import { Section } from "./section";
import { AppText } from "./text";
import { Touchable } from "./touchable";

const MINUTE_MS = 60_000;
const MINUTES_PER_HOUR = 60;
const AVATAR_SIZE = 40;

const styles = StyleSheet.create({
  account: { alignItems: "center", flexDirection: "row", gap: spacing.md },
  accountText: { flex: 1, gap: 2 },
  avatar: { backgroundColor: colors.surface, borderRadius: radius.pill, height: AVATAR_SIZE, width: AVATAR_SIZE },
  button: {
    alignItems: "center",
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  divider: { backgroundColor: colors.border, height: 1 },
  error: { color: colors.danger },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    color: colors.text,
    flex: 1,
    fontFamily,
    fontSize: fontSize.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  primary: { backgroundColor: colors.accent, borderColor: colors.accent },
  row: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
  stack: { gap: spacing.md },
});

const describeAgo = (at: number | undefined, now: number): string => {
  if (at === undefined) {
    return "never";
  }
  const minutes = Math.round((now - at) / MINUTE_MS);
  if (minutes < 1) {
    return "just now";
  }
  return minutes < MINUTES_PER_HOUR ? `${minutes} min ago` : new Date(at).toLocaleString();
};

const errorText = (error: unknown): string => (error instanceof Error ? error.message : "Something went wrong");

interface ButtonProps {
  label: string;
  onPress: () => void;
  primary?: boolean;
  busy?: boolean;
}

const Button = ({ label, onPress, primary = false, busy = false }: ButtonProps) => (
  <Touchable
    accessibilityRole="button"
    accessibilityState={{ busy }}
    disabled={busy}
    onPress={onPress}
    style={[styles.button, primary ? styles.primary : null]}
  >
    {busy ? <ActivityIndicator color={colors.text} /> : <AppText variant="label">{label}</AppText>}
  </Touchable>
);

const plural = (count: number, word: string): string => `${count} ${word}${count === 1 ? "" : "s"}`;

/** What a sync did, in one sentence per kind of change. */
const describeSummary = (summary: PullSummary, label: string): string =>
  [
    `${plural(summary.added, "show")} added and ${summary.updated} updated from ${label}.`,
    summary.sent > 0 ? `${plural(summary.sent, "newer change")} sent back.` : undefined,
    summary.removedRemotely > 0
      ? `${plural(summary.removedRemotely, "show")} removed on a service stay in Ikuzo.`
      : undefined,
  ]
    .filter(Boolean)
    .join(" ");

const HOLD_TEXT: Record<HoldReason, (count: number, label: string) => string> = {
  "bulk-add": (count, label) => `${plural(count, "show")} from Ikuzo are not on your ${label} list yet.`,
  "bulk-remove": (count, label) => `${plural(count, "show")} will be removed from your ${label} list.`,
};

const HOLD_ACTIONS: Record<HoldReason, { approve: string; discard: string }> = {
  "bulk-add": { approve: "Add them", discard: "Don't add" },
  "bulk-remove": { approve: "Remove there too", discard: "Keep them there" },
};

/** Big batches of changes wait here for an explicit OK before they reach a service. */
const HeldChanges = () => {
  const queue = useAccounts((state) => state.queue);
  const groups = groupHeld(queue);
  if (groups.length === 0) {
    return null;
  }
  return (
    <>
      <View style={styles.divider} />
      <AppText variant="label">Waiting for your OK</AppText>
      {groups.map((group) => {
        const label = TRACKER_LABELS[group.tracker];
        const actions = HOLD_ACTIONS[group.reason];
        const titles = group.ops
          .slice(0, 3)
          .map((op) => op.title)
          .join(", ");
        return (
          <View key={`${group.tracker}:${group.reason}`} style={styles.stack}>
            <AppText variant="caption">
              {HOLD_TEXT[group.reason](group.ops.length, label)} {titles}
              {group.ops.length > 3 ? "…" : ""}
            </AppText>
            <View style={styles.row}>
              <Button
                label={actions.approve}
                onPress={() => {
                  Alert.alert(actions.approve, HOLD_TEXT[group.reason](group.ops.length, label), [
                    { style: "cancel", text: "Cancel" },
                    {
                      onPress: () => {
                        approveHeld(group.tracker, group.reason);
                      },
                      style: group.reason === "bulk-remove" ? "destructive" : "default",
                      text: actions.approve,
                    },
                  ]);
                }}
                primary={group.reason === "bulk-add"}
              />
              <Button
                label={actions.discard}
                onPress={() => {
                  discardHeld(group.tracker, group.reason);
                }}
                primary={group.reason === "bulk-remove"}
              />
            </View>
          </View>
        );
      })}
    </>
  );
};

const AccountRow = ({ tracker }: { tracker: TrackerId }) => {
  const profile = useAccounts((state) => state.profiles[tracker]);
  const needsSignIn = useAccounts((state) => state.needsSignIn.includes(tracker));
  const [busy, setBusy] = useState(false);
  const label = TRACKER_LABELS[tracker];

  const onConnect = async () => {
    setBusy(true);
    try {
      const result = await connect(tracker);
      if (result !== false) {
        const toAdd = result.toAdd[tracker] ?? 0;
        if (toAdd > 0) {
          Alert.alert(
            `${label} connected`,
            `${describeSummary(result, label)}\n\n${HOLD_TEXT["bulk-add"](toAdd, label)} Add them to ${label}?`,
            [
              { style: "cancel", text: "Not now" },
              {
                onPress: () => {
                  approveHeld(tracker, "bulk-add");
                },
                text: "Add them",
              },
            ]
          );
        } else {
          Alert.alert(`${label} connected`, describeSummary(result, label));
        }
      }
    } catch (error) {
      Alert.alert(`Could not connect ${label}`, errorText(error));
    }
    setBusy(false);
  };

  const onDisconnect = () => {
    const pending = pendingFor(tracker);
    const message = [
      "Your Ikuzo list stays on this phone; it just stops syncing.",
      pending > 0 ? `${plural(pending, "change")} not sent to ${label} yet will be discarded.` : undefined,
    ]
      .filter(Boolean)
      .join(" ");
    Alert.alert(`Disconnect ${label}?`, message, [
      { style: "cancel", text: "Cancel" },
      {
        onPress: () => {
          void disconnect(tracker);
        },
        style: "destructive",
        text: "Disconnect",
      },
    ]);
  };

  return (
    <View style={styles.account}>
      {profile?.avatar === undefined ? null : <Image source={profile.avatar} style={styles.avatar} />}
      <View style={styles.accountText}>
        <AppText variant="label">{label}</AppText>
        <AppText variant="caption">{profile === undefined ? "Not connected" : `Signed in as ${profile.name}`}</AppText>
        {needsSignIn && profile !== undefined ? (
          <AppText style={styles.error} variant="caption">
            Sign-in expired, changes are waiting
          </AppText>
        ) : null}
      </View>
      {profile === undefined ? (
        <Button
          busy={busy}
          label="Connect"
          onPress={() => {
            void onConnect();
          }}
          primary
        />
      ) : (
        <View style={styles.row}>
          {needsSignIn ? (
            <Button
              busy={busy}
              label="Reconnect"
              onPress={() => {
                void onConnect();
              }}
              primary
            />
          ) : null}
          <Button label="Disconnect" onPress={onDisconnect} />
        </View>
      )}
    </View>
  );
};

const syncNow = async () => {
  try {
    await pull();
  } catch (error) {
    Alert.alert("Sync failed", errorText(error));
  }
};

const SyncStatus = () => {
  const hasProfile = useAccounts((state) => state.profiles.anilist !== undefined || state.profiles.mal !== undefined);
  const syncing = useAccounts((state) => state.syncing);
  const lastSyncAt = useAccounts((state) => state.lastSyncAt);
  const lastError = useAccounts((state) => state.lastError);
  const pending = useAccounts((state) => state.queue.length);
  const now = useNow();

  if (!hasProfile) {
    return null;
  }
  return (
    <>
      <View style={styles.divider} />
      <View style={styles.row}>
        <View style={styles.accountText}>
          <AppText variant="caption">
            Last synced {describeAgo(lastSyncAt, now)}
            {pending > 0 ? ` · ${pending} change${pending === 1 ? "" : "s"} waiting` : ""}
          </AppText>
          {lastError === undefined ? null : (
            <AppText style={styles.error} variant="caption">
              {lastError}
            </AppText>
          )}
        </View>
        <Button
          busy={syncing}
          label="Sync now"
          onPress={() => {
            void syncNow();
          }}
        />
      </View>
    </>
  );
};

const runImport = async (shows: RemoteEntry[]) => {
  const added = await importPublicList(shows);
  Alert.alert("List imported", `${plural(added, "show")} added.`);
};

/** Read-only import of anyone's public list, for people who would rather not sign in. */
const PublicImport = () => {
  const [tracker, setTracker] = useState<TrackerId>("mal");
  const [userName, setUserName] = useState("");
  const [busy, setBusy] = useState(false);

  const confirmImport = (shows: RemoteEntry[]) => {
    if (shows.length === 0) {
      Alert.alert("Nothing to import", "Every show on that list is already in Ikuzo.");
      return;
    }
    Alert.alert(
      "Import list?",
      `${plural(shows.length, "show")} from ${userName.trim()}’s list will be added to Ikuzo. Shows already in your list are left as they are, and nothing is sent to your accounts.`,
      [
        { style: "cancel", text: "Cancel" },
        {
          onPress: () => {
            void runImport(shows);
          },
          text: "Import",
        },
      ]
    );
  };

  const onImport = async () => {
    if (userName.trim() === "") {
      return;
    }
    setBusy(true);
    try {
      confirmImport(await previewPublicList(tracker, userName));
    } catch (error) {
      Alert.alert("Import failed", errorText(error));
    }
    setBusy(false);
  };

  return (
    <>
      <View style={styles.divider} />
      <AppText variant="label">Import a public list</AppText>
      <AppText variant="caption">
        Adds the shows of anyone’s public list to Ikuzo without signing in. Nothing is sent back.
      </AppText>
      <ChipRow
        onToggle={setTracker}
        options={TRACKERS.map((value) => ({ label: TRACKER_LABELS[value], value }))}
        selected={[tracker]}
      />
      <View style={styles.row}>
        <TextInput
          accessibilityLabel="User name"
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={setUserName}
          placeholder="User name"
          placeholderTextColor={colors.textSubtle}
          style={styles.input}
          value={userName}
        />
        <Button
          busy={busy}
          label="Import"
          onPress={() => {
            void onImport();
          }}
        />
      </View>
    </>
  );
};

export const AccountsSection = () => (
  <Section title="Accounts">
    <View style={styles.stack}>
      <AppText variant="caption">
        Connect AniList or MyAnimeList to bring your list into Ikuzo and keep both sides in sync.
      </AppText>
      {TRACKERS.map((tracker) => (
        <AccountRow key={tracker} tracker={tracker} />
      ))}
      <SyncStatus />
      <HeldChanges />
      <PublicImport />
    </View>
  </Section>
);
