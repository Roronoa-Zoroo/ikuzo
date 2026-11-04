import { TRACKER_LABELS, TRACKERS } from "@ikuzo/anime/trackers";
import type { TrackerId } from "@ikuzo/anime/trackers";
import { Image } from "expo-image";
import { useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, View } from "react-native";

import { groupHeld, mainTracker, useAccounts } from "@/lib/accounts";
import {
  approveHeldDeletes,
  approveHeldRemovals,
  connect,
  copyListTo,
  disconnect,
  discardHeldRemovals,
  dismissHeldDeletes,
  pendingFor,
  pull,
  switchMain,
  uploadLocalList,
  replaceWithAccountList,
} from "@/lib/sync";
import type { ConnectResult, PullSummary } from "@/lib/sync";
import { colors, radius, spacing } from "@/lib/theme";
import { useNow } from "@/lib/use-now";

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
  primary: { backgroundColor: colors.accent, borderColor: colors.accent },
  row: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
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

const describeSummary = (summary: PullSummary, label: string): string =>
  [
    `Your ${label} list is in Ikuzo: ${plural(summary.added, "show")} added, ${summary.updated} updated, ${summary.removed} removed.`,
    summary.heldRemovals > 0
      ? `${plural(summary.heldRemovals, "show")} missing from ${label} are kept until you confirm in Settings.`
      : undefined,
  ]
    .filter(Boolean)
    .join(" ");

const report = async (label: string, run: () => Promise<PullSummary>) => {
  try {
    Alert.alert(label, describeSummary(await run(), label));
  } catch (error) {
    Alert.alert(`${label} sync failed`, errorText(error));
  }
};

/** Asks what happens next after connecting; every choice is explicit. */
const afterConnect = (tracker: TrackerId, result: ConnectResult) => {
  const label = TRACKER_LABELS[tracker];
  if (result.kind === "synced") {
    Alert.alert(`${label} connected`, describeSummary(result.summary, label));
  } else if (result.kind === "choose") {
    Alert.alert(
      `${label} connected`,
      `Ikuzo now shows your ${label} list (${plural(result.accountShows, "show")}). This phone already has ${plural(
        result.localShows,
        "show"
      )}.\n\n"Upload" adds the ${plural(result.toUpload, "show")} ${label} does not have yet and keeps everything on ${label} as it is.\n\n"Use ${label}'s list" replaces this phone's list (you can undo that for a day in Settings → Backup).`,
      [
        {
          onPress: () => {
            void report(label, replaceWithAccountList);
          },
          style: "destructive",
          text: `Use ${label}'s list`,
        },
        {
          onPress: () => {
            void report(label, uploadLocalList);
          },
          text: "Upload",
        },
      ],
      { cancelable: false }
    );
  } else if (result.kind === "copy") {
    const main = mainTracker();
    const mainLabel = main === undefined ? "your main account" : TRACKER_LABELS[main];
    Alert.alert(
      `${label} connected`,
      `Ikuzo keeps showing your ${mainLabel} list. Changes you make are also sent to ${label}, which is never read back.\n\nCopy all ${plural(result.shows, "show")} to ${label} now? Shows already on ${label} get the values from ${mainLabel}.`,
      [
        { style: "cancel", text: "Only new changes" },
        {
          onPress: () => {
            copyListTo(tracker);
          },
          text: "Copy all",
        },
      ]
    );
  }
};

/** Bulk removals wait here for an explicit OK before they reach an account. */
const HeldRemovals = () => {
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
        const count = group.ops.length;
        const titles = group.ops
          .slice(0, 3)
          .map((op) => op.title)
          .join(", ");
        const text = `${plural(count, "show")} you deleted in Ikuzo will be removed from ${label}: ${titles}${count > 3 ? "…" : "."} Keeping them on ${label} brings them back into Ikuzo.`;
        return (
          <View key={group.tracker} style={styles.stack}>
            <AppText variant="caption">{text}</AppText>
            <View style={styles.row}>
              <Button
                label="Remove there too"
                onPress={() => {
                  Alert.alert(`Remove ${plural(count, "show")} from ${label}?`, undefined, [
                    { style: "cancel", text: "Cancel" },
                    {
                      onPress: () => {
                        approveHeldRemovals(group.tracker);
                      },
                      style: "destructive",
                      text: "Remove",
                    },
                  ]);
                }}
              />
              <Button
                label="Keep them"
                onPress={() => {
                  discardHeldRemovals(group.tracker);
                }}
                primary
              />
            </View>
          </View>
        );
      })}
    </>
  );
};

/** Shows the main account no longer lists, when there were suspiciously many at once. */
const HeldDeletes = () => {
  const held = useAccounts((state) => state.heldDeletes);
  if (held === undefined) {
    return null;
  }
  const label = TRACKER_LABELS[held.tracker];
  return (
    <>
      <View style={styles.divider} />
      <AppText variant="label">Waiting for your OK</AppText>
      <AppText variant="caption">
        {`${plural(held.keys.length, "show")} in Ikuzo are no longer on your ${label} list. Remove them from Ikuzo too? (You can undo it for a day.)`}
      </AppText>
      <View style={styles.row}>
        <Button
          label="Remove from Ikuzo"
          onPress={() => {
            void approveHeldDeletes();
          }}
        />
        <Button label="Keep for now" onPress={dismissHeldDeletes} primary />
      </View>
    </>
  );
};

const AccountRow = ({ tracker }: { tracker: TrackerId }) => {
  const profile = useAccounts((state) => state.profiles[tracker]);
  const needsSignIn = useAccounts((state) => state.needsSignIn.includes(tracker));
  const isMain = useAccounts((state) => {
    const connected = TRACKERS.filter((item) => state.profiles[item] !== undefined);
    const main = state.main !== undefined && connected.includes(state.main) ? state.main : connected[0];
    return main === tracker;
  });
  const [busy, setBusy] = useState(false);
  const label = TRACKER_LABELS[tracker];

  const onConnect = async () => {
    setBusy(true);
    try {
      afterConnect(tracker, await connect(tracker));
    } catch (error) {
      Alert.alert(`Could not connect ${label}`, errorText(error));
    }
    setBusy(false);
  };

  const onMakeMain = () => {
    Alert.alert(
      `Show your ${label} list?`,
      `Ikuzo will show and edit your ${label} list; the other account keeps receiving a copy of changes. The list on this phone is replaced by ${label}'s (you can undo it for a day).`,
      [
        { style: "cancel", text: "Cancel" },
        {
          onPress: () => {
            void report(label, async () => await switchMain(tracker));
          },
          text: `Use ${label}`,
        },
      ]
    );
  };

  const onDisconnect = () => {
    const pending = pendingFor(tracker);
    const message = [
      isMain
        ? "Your list stays on this phone. If your other account is connected, Ikuzo shows its list instead."
        : `Changes stop being copied to ${label}.`,
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

  let role = "Not connected";
  if (profile !== undefined) {
    role = isMain ? `${profile.name} · your list` : `${profile.name} · gets a copy of changes`;
  }

  return (
    <View style={styles.account}>
      {profile?.avatar === undefined ? null : <Image source={profile.avatar} style={styles.avatar} />}
      <View style={styles.accountText}>
        <AppText variant="label">{label}</AppText>
        <AppText variant="caption">{role}</AppText>
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
          {isMain ? null : <Button label="Make main" onPress={onMakeMain} />}
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
            {pending > 0 ? ` · ${plural(pending, "change")} waiting` : ""}
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

export const AccountsSection = () => (
  <Section title="Accounts">
    <View style={styles.stack}>
      <AppText variant="caption">
        Connect AniList or MyAnimeList and Ikuzo shows and edits that list. A second account gets a copy of every
        change. Without an account your list stays on this phone.
      </AppText>
      {TRACKERS.map((tracker) => (
        <AccountRow key={tracker} tracker={tracker} />
      ))}
      <SyncStatus />
      <HeldRemovals />
      <HeldDeletes />
    </View>
  </Section>
);
