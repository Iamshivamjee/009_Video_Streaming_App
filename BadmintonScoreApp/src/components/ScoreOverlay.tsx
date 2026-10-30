import React from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { useGame } from '../context/GameContext';

export const ScoreOverlay: React.FC = () => {
  const { state } = useGame();
  const teamAScoreAnim = React.useRef(new Animated.Value(0)).current;
  const teamBScoreAnim = React.useRef(new Animated.Value(0)).current;
  const prevTeamAScore = React.useRef(state.teamA.score);
  const prevTeamBScore = React.useRef(state.teamB.score);

  React.useEffect(() => {
    if (state.teamA.score !== prevTeamAScore.current) {
      Animated.timing(teamAScoreAnim, {
        toValue: 1,
        duration: 250,
        easing: Easing.out(Easing.back(1.3)),
        useNativeDriver: true,
      }).start(() => teamAScoreAnim.setValue(0));
      prevTeamAScore.current = state.teamA.score;
    }
  }, [state.teamA.score, teamAScoreAnim]);

  React.useEffect(() => {
    if (state.teamB.score !== prevTeamBScore.current) {
      Animated.timing(teamBScoreAnim, {
        toValue: 1,
        duration: 250,
        easing: Easing.out(Easing.back(1.3)),
        useNativeDriver: true,
      }).start(() => teamBScoreAnim.setValue(0));
      prevTeamBScore.current = state.teamB.score;
    }
  }, [state.teamB.score, teamBScoreAnim]);

  const teamAScale = teamAScoreAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.12],
  });
  const teamBScale = teamBScoreAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.12],
  });
  const gameStatus = state.gameStatus === 'playing'
    ? 'LIVE'
    : state.gameStatus === 'paused'
      ? 'PAUSED'
      : state.gameStatus === 'finished'
        ? 'MATCH COMPLETE'
        : 'READY';
  return (
    <View pointerEvents="none" style={styles.overlayContainer}>
      <View style={styles.scoreboard} accessibilityLabel="Live badminton score">
        <View style={styles.teamRow}>
          <View style={[styles.teamAccent, styles.teamAAccent]} />
          <Text numberOfLines={1} style={styles.teamName}>
            {state.teamA.name}
            {state.currentServer === 'teamA' ? '  ●' : ''}
          </Text>
          <Animated.View style={[styles.scoreBadge, { transform: [{ scale: teamAScale }] }]}>
            <Text style={styles.score}>{state.teamA.score}</Text>
          </Animated.View>
        </View>

        <View style={styles.teamRow}>
          <View style={[styles.teamAccent, styles.teamBAccent]} />
          <Text numberOfLines={1} style={styles.teamName}>
            {state.teamB.name}
            {state.currentServer === 'teamB' ? '  ●' : ''}
          </Text>
          <Animated.View style={[styles.scoreBadge, { transform: [{ scale: teamBScale }] }]}>
            <Text style={styles.score}>{state.teamB.score}</Text>
          </Animated.View>
        </View>

        <View style={styles.matchInfo}>
          <Text style={styles.gameInfo}>
            GAME {state.currentGame}/{state.bestOf} · TO {state.winningScore}
          </Text>
          <Text style={styles.gameStatus}>{gameStatus}</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  overlayContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    padding: 5,
  },
  scoreboard: {
    width: '29%',
    minWidth: 210,
    maxWidth: 360,
    aspectRatio: 2.8,
    paddingHorizontal: 7,
    paddingVertical: 4,
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0, 0, 0, 0.86)',
    borderRadius: 6,
    zIndex: 1,
    elevation: 1,
  },
  teamRow: {
    flex: 1,
    minHeight: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  teamName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    includeFontPadding: false,
  },
  teamAccent: {
    width: 4,
    height: '72%',
    borderRadius: 2,
  },
  teamAAccent: {
    backgroundColor: '#00BFFF',
  },
  teamBAccent: {
    backgroundColor: '#31C85B',
  },
  scoreBadge: {
    minWidth: 22,
    height: 21,
    paddingHorizontal: 4,
    borderRadius: 3,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  score: {
    fontSize: 15,
    fontWeight: '900',
    color: '#161616',
    fontVariant: ['tabular-nums'],
    includeFontPadding: false,
  },
  matchInfo: {
    height: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255, 255, 255, 0.35)',
  },
  gameInfo: {
    fontSize: 9,
    fontWeight: '700',
    color: '#D7D7D7',
  },
  gameStatus: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
