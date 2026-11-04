import { TRACKER_LABELS, TRACKERS } from "@ikuzo/anime/trackers";
import type { TrackerId } from "@ikuzo/anime/trackers";
import { Image } from "expo-image";
import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, TextInput, View } from "react-native";

import { useAccounts } from "@/lib/accounts";
import { connect, disconnect, importPublicList, pull } from "@/lib/sync";
import { colors, fontSize, radius, spacing } from "@/lib/theme";
import { useNow } from "@/lib/use-now";

import { ChipRow } from "./chips";
import { Section } from "./section";
import { AppText } from "./text";

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
  <Pressable
    accessibilityRole="button"
    accessibilityState={{ busy }}
    disabled={busy}
    onPress={onPress}
    style={[styles.button, primary ? styles.primary : null]}
  >
    {busy ? <ActivityIndicator color={colors.text} /> : <AppText variant="label">{label}</AppText>}
  </Pressable>
);

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
        Alert.alert(
          `${label} connected`,
          `${result.added} shows added and ${result.updated} updated from ${label}. ${result.sent} newer changes were sent to ${label}.`
        );
      }
    } catch (error) {
      Alert.alert(`Could not connect ${label}`, errorText(error));
    }
    setBusy(false);
  };

  const onDisconnect = () => {
    Alert.alert(`Disconnect ${label}?`, "Your Ikuzo list stays on this phone; it just stops syncing.", [
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
        {needsSignIn ? (
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

/** Read-only import of anyone's public list, for people who would rather not sign in. */
const PublicImport = () => {
  const [tracker, setTracker] = useState<TrackerId>("mal");
  const [userName, setUserName] = useState("");
  const [busy, setBusy] = useState(false);

  const onImport = async () => {
    if (userName.trim() === "") {
      return;
    }
    setBusy(true);
    try {
      const result = await importPublicList(tracker, userName);
      Alert.alert("List imported", `${result.added} shows added and ${result.updated} updated.`);
    } catch (error) {
      Alert.alert("Import failed", errorText(error));
    }
    setBusy(false);
  };

  return (
    <>
      <View style={styles.divider} />
      <AppText variant="label">Import a public list</AppText>
      <AppText variant="caption">Copies a list into Ikuzo without signing in. Changes are not sent back.</AppText>
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
      <PublicImport />
    </View>
  </Section>
);
