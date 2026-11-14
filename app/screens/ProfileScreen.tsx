import { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, Linking } from 'react-native';
import {
  getFeatureInbox,
  getFeatureSent,
  respondFeature,
  FeatureRequest,
  getDashboard,
  Dashboard,
  getPassEligibility,
  getPassMe,
  getPassStake,
  PassEligibility,
  PassMe,
  StakeStatus,
} from '../services/beatService';
import { getCurrentUser } from '../services/authService';
import Button from '../components/Button';

export default function ProfileScreen({ navigation }: any) {
  const [inbox, setInbox] = useState<FeatureRequest[]>([]);
  const [sent, setSent] = useState<FeatureRequest[]>([]);
  const [featuresUnavailable, setFeaturesUnavailable] = useState(false);
  const [featuresLoaded, setFeaturesLoaded] = useState(false);
  // VBEATS membership (Nov 13): real balance + pass state for the
  // connected wallet. Null = not loaded / no wallet / backend down —
  // the card stays hidden rather than inventing a balance or a badge.
  const [member, setMember] = useState<PassEligibility | null>(null);
  const [passMe, setPassMe] = useState<PassMe | null>(null);
  const [memberLoaded, setMemberLoaded] = useState(false);
  // VBEATS staking (Nov 13): 1,000 VBEATS staked unlocks selling only
  // (listing, Make a song, producer dashboard). Buying in ETH and
  // voting stay open to everyone — no stake required for either.
  // Null = not loaded / backend down — the card stays hidden rather
  // than inventing a stake. Stake/unstake happen on the web claim
  // page — mobile deep-links there and never fakes the tx.
  const [stake, setStake] = useState<StakeStatus | null>(null);

  const loadMember = useCallback(async () => {
    try {
      const u = await getCurrentUser();
      const wallet = u?.wallet;
      if (!wallet) {
        setMemberLoaded(true);
        return;
      }
      const [elig, me, stk] = await Promise.all([
        getPassEligibility(wallet),
        getPassMe(wallet),
        getPassStake(wallet),
      ]);
      setMember(elig);
      setPassMe(me);
      setStake(stk);
    } catch {
      // Leave the card hidden on failure — never a fake member badge.
    } finally {
      setMemberLoaded(true);
    }
  }, []);

  useEffect(() => {
    void loadMember();
  }, [loadMember]);
  // Producer dashboard (money path, Nov 13): real earnings from
  // completed on-chain license sales. Null = not loaded yet; the
  // 'unavailable' flag means the old backend (404) — the numbers then
  // show as "—" with an honest note, never as invented zeros.
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [dashboardUnavailable, setDashboardUnavailable] = useState(false);

  const loadDashboard = useCallback(async () => {
    try {
      setDashboard(await getDashboard());
    } catch (e: any) {
      if (String(e?.message || '').includes('404')) {
        setDashboardUnavailable(true);
      }
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  // Feature / co-sign requests (Nov 13): producers answer requests for
  // their beats here; singers see what they sent. A 404 means the old
  // backend — the section stays hidden instead of faking data.
  const loadFeatures = useCallback(async () => {
    try {
      const [inb, snt] = await Promise.all([getFeatureInbox(), getFeatureSent()]);
      setInbox(inb);
      setSent(snt);
      setFeaturesLoaded(true);
    } catch (e: any) {
      if (String(e?.message || '').includes('404')) {
        setFeaturesUnavailable(true);
      }
      setFeaturesLoaded(true);
    }
  }, []);

  useEffect(() => {
    void loadFeatures();
  }, [loadFeatures]);

  const handleRespond = async (id: string, action: 'accept' | 'decline') => {
    try {
      await respondFeature(id, action);
      await loadFeatures();
    } catch {
      Alert.alert('Error', 'Could not answer the request');
    }
  };

  const requestRow = (r: FeatureRequest, mine: boolean) => (
    <View key={r.id} style={styles.requestRow}>
      <Text style={styles.requestTitle}>{r.song?.title || 'Song'}</Text>
      <Text style={styles.requestSub}>
        over {r.parentBeat?.title || 'the parent beat'} · from {r.requester?.username || 'the singer'}
      </Text>
      <Text style={styles.requestSub}>Status: {r.status}</Text>
      {r.message ? <Text style={styles.requestSub}>“{r.message}”</Text> : null}
      {mine && r.status === 'pending' && (
        <View style={styles.requestActions}>
          <Button title="Accept" onPress={() => void handleRespond(r.id, 'accept')} />
          <Button title="Decline" variant="secondary" onPress={() => void handleRespond(r.id, 'decline')} />
        </View>
      )}
    </View>
  );

  const showFeatures = featuresLoaded && !featuresUnavailable && (inbox.length > 0 || sent.length > 0);

  return (
    <ScrollView style={styles.container}>
      <View style={styles.profileHeader}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>VB</Text>
        </View>
        <Text style={styles.name}>Your Profile</Text>
      </View>

      {memberLoaded && member && member.configured !== false ? (
        <View style={styles.memberCard}>
          {member.hasPass ? (
            <>
              <Text style={styles.memberTitle}>🦇 Member #{passMe?.memberNumber ?? member.memberNumber ?? ''} — Founding Producer</Text>
              <Text style={styles.note}>Volt Pass claimed. Your VBEATS balance: {member.balanceFormatted}.</Text>
            </>
          ) : Number(member.balanceFormatted || 0) > 0 ? (
            <>
              <Text style={styles.memberTitle}>{member.balanceFormatted} / {member.threshold || '10'} VBEATS</Text>
              <Text style={styles.note}>
                {member.eligible
                  ? 'Your Volt Pass is ready to claim.'
                  : `Hold ${member.threshold || '10'} VBEATS to claim your Volt Pass.`}
              </Text>
              <Text
                style={styles.link}
                onPress={() => Linking.openURL('https://ov4433.github.io/vbeats.app/claim.html')}
              >
                Claim your pass →
              </Text>
            </>
          ) : (
            <>
              <Text style={styles.memberTitle}>0 / {member.threshold || '10'} VBEATS</Text>
              <Text style={styles.note}>Hold {member.threshold || '10'} VBEATS to claim your Volt Pass and unlock member weight in voting.</Text>
            </>
          )}
        </View>
      ) : null}

      {memberLoaded && stake ? (
        <View style={styles.memberCard}>
          {stake.isStaked ? (
            <>
              <Text style={styles.memberTitle}>✅ Staked — {stake.stakedFormatted} VBEATS</Text>
              <Text style={styles.note}>
                Selling is unlocked: listing beats for sale, making songs, the producer dashboard and the feature inbox. Unstake any time and the full 1,000 VBEATS comes back.
              </Text>
            </>
          ) : stake.configured === false ? (
            <>
              <Text style={styles.memberTitle}>🔒 Stake 1,000 VBEATS to sell</Text>
              <Text style={styles.note}>
                Staking goes live after the stake contract is deployed. Stake exactly 1,000 VBEATS to sell: listing beats for sale, making songs, the producer dashboard and the feature inbox. The studio stays free, and buying beats in ETH stays open to everyone — the stake is only required to sell. Unstake any time and the full 1,000 comes back. Nothing is blocked until staking goes live.
                {member ? ` Your VBEATS balance: ${member.balanceFormatted}.` : ''}
              </Text>
            </>
          ) : (
            <>
              <Text style={styles.memberTitle}>🔒 Stake 1,000 VBEATS to sell</Text>
              <Text style={styles.note}>
                {member && Number(member.balanceFormatted || 0) < 1000
                  ? `You hold ${member.balanceFormatted} VBEATS — you need 1,000 to stake. Top up on Pons first.`
                  : 'You\u2019re ready to stake. Two wallet confirmations: approve 1,000 VBEATS, then stake.'}
                {' '}Unstake any time — the full 1,000 comes back. No lockup, no yield — the access is the reward.
              </Text>
            </>
          )}
          <Text
            style={styles.link}
            onPress={() => Linking.openURL('https://ov4433.github.io/vbeats.app/claim.html#stake')}
          >
            {stake.isStaked ? 'Manage your stake on the web →' : 'Stake on the web →'}
          </Text>
        </View>
      ) : null}

      <View style={styles.statsContainer}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{dashboard ? String(dashboard.beatsCount) : '—'}</Text>
          <Text style={styles.statLabel}>Beats</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{dashboard ? String(dashboard.salesCount) : '—'}</Text>
          <Text style={styles.statLabel}>Sales</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{dashboard ? `${dashboard.earningsEth} ETH` : '—'}</Text>
          <Text style={styles.statLabel}>Earnings (net)</Text>
        </View>
      </View>

      {dashboardUnavailable && (
        <Text style={styles.note}>
          Earnings need the latest backend — it has not landed yet, so sales and offers are not shown here. Your on-chain receipts are still the proof.
        </Text>
      )}

      {dashboard && (
        <View style={styles.dashboardSection}>
          <Text style={styles.sectionTitle}>💰 Producer dashboard</Text>
          <Text style={styles.note}>
            5% platform fee — the producer gets 95% of the listed price on escrow sales. Earnings are net of the fee; completed on-chain sales only. Direct sales are legacy 0%-fee.
          </Text>
          {stake && !stake.isStaked && (
            <Text style={styles.note}>
              {stake.configured === false
                ? 'Selling, Make a song and the producer dashboard — selling takes a 1,000 VBEATS stake. Staking goes live after the stake contract is deployed — nothing is blocked until then.'
                : 'Stake 1,000 VBEATS to sell — selling, Make a song and the producer dashboard. Unstake any time — the full 1,000 comes back.'}
            </Text>
          )}
          {dashboard.grossEth != null || dashboard.feeEth != null ? (
            <Text style={styles.note}>
              Gross {dashboard.grossEth ?? 0} ETH · Fee {dashboard.feeEth ?? 0} ETH · Net {dashboard.earningsEth} ETH
            </Text>
          ) : null}
          {dashboard.perBeat.length === 0 ? (
            <Text style={styles.note}>No sales yet — list a beat for sale and instant buy goes live.</Text>
          ) : (
            dashboard.perBeat.map((p) => (
              <View key={p.beatId} style={styles.requestRow}>
                <Text style={styles.requestTitle}>{p.title}</Text>
                <Text style={styles.requestSub}>
                  {p.sales} sold · {p.eth} ETH net{p.feeEth ? ` · fee ${p.feeEth} ETH` : ''}
                </Text>
              </View>
            ))
          )}
          <Text style={[styles.sectionSub, { marginTop: 16 }]}>Pending offers on your beats</Text>
          {dashboard.offersUnavailable ? (
            <Text style={styles.note}>Offers could not be read from the chain right now — check the beat pages directly.</Text>
          ) : dashboard.pendingOffers.length === 0 ? (
            <Text style={styles.note}>No offers waiting on you.</Text>
          ) : (
            dashboard.pendingOffers.map((o) => (
              <TouchableOpacity
                key={o.offerId}
                style={styles.requestRow}
                onPress={() => navigation.navigate('BeatDetail', { beatId: o.beatId })}
              >
                <Text style={styles.requestTitle}>{o.beatTitle}</Text>
                <Text style={styles.requestSub}>
                  {o.exclusive ? '1-of-1 exclusive' : `${o.amount} leases`} · bid {o.bidEth} ETH · from {o.buyer.slice(0, 6)}…{o.buyer.slice(-4)}
                </Text>
              </TouchableOpacity>
            ))
          )}
          <Text style={[styles.sectionSub, { marginTop: 16 }]}>My purchases</Text>
          {dashboard.purchases.length === 0 ? (
            <Text style={styles.note}>No purchases yet — when you buy a license it shows here with its receipt and a free re-download.</Text>
          ) : (
            dashboard.purchases.map((t) => (
              <View key={t.id} style={styles.requestRow}>
                <Text style={styles.requestTitle}>{t.beat?.title || 'Beat'}</Text>
                <Text style={styles.requestSub}>
                  {t.licenseKind || t.type || 'license'} · {t.amount} {t.currency || 'ETH'} · {t.status}
                </Text>
                {t.txHash ? (
                  <Text
                    style={styles.link}
                    onPress={() => Linking.openURL(`https://basescan.org/tx/${t.txHash}`)}
                  >
                    View receipt on Basescan →
                  </Text>
                ) : null}
                {t.beat?.audioUrl ? (
                  <Text
                    style={styles.link}
                    onPress={() => Linking.openURL(t.beat!.audioUrl)}
                  >
                    ⬇ Download licensed audio
                  </Text>
                ) : null}
              </View>
            ))
          )}
        </View>
      )}

      <TouchableOpacity
        style={[styles.button, { marginBottom: 12 }]}
        onPress={() => navigation.navigate('Beats')}
      >
        <Text style={styles.buttonText}>My Beats</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.button}>
        <Text style={styles.buttonText}>Edit Profile</Text>
      </TouchableOpacity>

      {showFeatures && (
        <View style={styles.featuresSection}>
          <Text style={styles.sectionTitle}>🎤 Feature requests</Text>
          <Text style={styles.sectionSub}>Requests for your beats</Text>
          {inbox.length === 0 ? (
            <Text style={styles.note}>No requests waiting on you.</Text>
          ) : (
            inbox.map((r) => requestRow(r, true))
          )}
          <Text style={[styles.sectionSub, { marginTop: 16 }]}>Your sent requests</Text>
          {sent.length === 0 ? (
            <Text style={styles.note}>You have not requested a feature yet.</Text>
          ) : (
            sent.map((r) => requestRow(r, false))
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    padding: 16,
  },
  profileHeader: {
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 30,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
  },
  name: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  // VBEATS membership card (Nov 13): real balance / member # only.
  memberCard: {
    backgroundColor: '#101016',
    borderWidth: 1,
    borderColor: '#963cff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 20,
  },
  memberTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 4,
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 30,
    paddingVertical: 20,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#1a1a1a',
  },
  stat: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#888',
  },
  button: {
    backgroundColor: '#1a1a1a',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  featuresSection: {
    marginTop: 24,
    borderTopWidth: 1,
    borderTopColor: '#1a1a1a',
    paddingTop: 16,
  },
  dashboardSection: {
    marginTop: 24,
    borderTopWidth: 1,
    borderTopColor: '#1a1a1a',
    paddingTop: 16,
  },
  link: {
    color: '#ff3d9a',
    fontSize: 13,
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  sectionSub: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
  },
  note: {
    color: '#888',
    fontSize: 13,
    marginBottom: 8,
  },
  requestRow: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  requestTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  requestSub: {
    color: '#888',
    fontSize: 13,
    marginTop: 2,
  },
  requestActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
});
