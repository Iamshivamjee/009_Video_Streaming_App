import React, { createContext, useContext, useReducer, useCallback, useEffect, ReactNode } from 'react';
import { GameState, Team, ScoreAction } from '../types';
import bluetoothService from '../services/bluetooth';

const initialState: GameState = {
  teamA: { id: 'teamA', name: 'Team A', score: 0 },
  teamB: { id: 'teamB', name: 'Team B', score: 0 },
  currentServer: 'teamA',
  gameStatus: 'waiting',
  winningScore: 21,
  bestOf: 3,
  currentGame: 1,
  gamesWon: { teamA: 0, teamB: 0 },
};

type GameAction = ScoreAction | { type: 'START_GAME' } | { type: 'PAUSE_GAME' };

function gameReducer(state: GameState, action: GameAction): GameState {
  const newState = { ...state };
  
  switch (action.type) {
    case 'START_GAME':
      if (state.gameStatus === 'waiting' || state.gameStatus === 'paused') {
        newState.gameStatus = 'playing';
      }
      break;

    case 'PAUSE_GAME':
      if (state.gameStatus === 'playing') {
        newState.gameStatus = 'paused';
      }
      break;

    case 'INCREMENT_TEAM_A':
      if (state.gameStatus === 'playing' && state.teamA.score < state.winningScore) {
        newState.teamA = { ...state.teamA, score: state.teamA.score + 1 };
        newState.currentServer = 'teamA';
        checkWinCondition(newState);
      }
      break;
      
    case 'INCREMENT_TEAM_B':
      if (state.gameStatus === 'playing' && state.teamB.score < state.winningScore) {
        newState.teamB = { ...state.teamB, score: state.teamB.score + 1 };
        newState.currentServer = 'teamB';
        checkWinCondition(newState);
      }
      break;
      
    case 'DECREMENT_TEAM_A':
      if (state.teamA.score > 0) {
        newState.teamA = { ...state.teamA, score: state.teamA.score - 1 };
      }
      break;
      
    case 'DECREMENT_TEAM_B':
      if (state.teamB.score > 0) {
        newState.teamB = { ...state.teamB, score: state.teamB.score - 1 };
      }
      break;
      
    case 'SET_TEAM_A_NAME':
      newState.teamA = { ...state.teamA, name: action.payload };
      break;
      
    case 'SET_TEAM_B_NAME':
      newState.teamB = { ...state.teamB, name: action.payload };
      break;
      
    case 'SET_TEAM_A_SCORE':
      newState.teamA = { ...state.teamA, score: Math.max(0, action.payload) };
      break;
      
    case 'SET_TEAM_B_SCORE':
      newState.teamB = { ...state.teamB, score: Math.max(0, action.payload) };
      break;
      
    case 'RESET_GAME':
      newState.teamA = { ...state.teamA, score: 0 };
      newState.teamB = { ...state.teamB, score: 0 };
      newState.currentServer = 'teamA';
      newState.gameStatus = 'waiting';
      break;
      
    case 'RESET_MATCH':
      return initialState;
      
    case 'TOGGLE_SERVER':
      newState.currentServer = state.currentServer === 'teamA' ? 'teamB' : 'teamA';
      break;
      
    case 'SET_WINNING_SCORE':
      newState.winningScore = Math.max(1, action.payload);
      break;
      
    case 'SET_BEST_OF':
      newState.bestOf = Math.max(1, action.payload);
      break;
      
    case 'UNDO':
      // Simple undo - just decrement the last scoring team
      // In a real app, you'd want a history stack
      break;
  }
  
  return newState;
}

function checkWinCondition(state: GameState): void {
  const { teamA, teamB, winningScore, bestOf, currentGame, gamesWon } = state;
  
  if (teamA.score >= winningScore || teamB.score >= winningScore) {
    const winner = teamA.score >= winningScore ? 'teamA' : 'teamB';
    state.gamesWon = { 
      ...gamesWon, 
      [winner]: gamesWon[winner as keyof typeof gamesWon] + 1 
    };
    
    if (state.gamesWon[winner as keyof typeof gamesWon] >= Math.ceil(bestOf / 2)) {
      state.gameStatus = 'finished';
    } else {
      state.currentGame += 1;
      state.teamA = { ...state.teamA, score: 0 };
      state.teamB = { ...state.teamB, score: 0 };
      state.currentServer = 'teamA';
      state.gameStatus = 'waiting';
    }
  }
}

interface GameContextType {
  state: GameState;
  dispatch: React.Dispatch<GameAction>;
  incrementTeamA: () => void;
  incrementTeamB: () => void;
  decrementTeamA: () => void;
  decrementTeamB: () => void;
  setTeamAName: (name: string) => void;
  setTeamBName: (name: string) => void;
  resetGame: () => void;
  resetMatch: () => void;
  toggleServer: () => void;
  startGame: () => void;
  pauseGame: () => void;
  setWinningScore: (score: number) => void;
  setBestOf: (games: number) => void;
}

const GameContext = createContext<GameContextType | undefined>(undefined);

export function GameProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(gameReducer, initialState);

  // Handle incoming actions from remote
  const handleRemoteAction = useCallback((action: GameAction) => {
    dispatch(action);
  }, []);

  // Set up Bluetooth listeners
  useEffect(() => {
    bluetoothService.onScoreUpdate(handleRemoteAction);
    
    return () => {
      bluetoothService.onScoreUpdate(() => {});
    };
  }, [handleRemoteAction]);

  useEffect(() => {
    bluetoothService.setCurrentScore(state.teamA.score, state.teamB.score);
  }, [state.teamA.score, state.teamB.score]);

  const incrementTeamA = useCallback(() => {
    dispatch({ type: 'INCREMENT_TEAM_A' });
  }, []);

  const incrementTeamB = useCallback(() => {
    dispatch({ type: 'INCREMENT_TEAM_B' });
  }, []);

  const decrementTeamA = useCallback(() => {
    dispatch({ type: 'DECREMENT_TEAM_A' });
  }, []);

  const decrementTeamB = useCallback(() => {
    dispatch({ type: 'DECREMENT_TEAM_B' });
  }, []);

  const setTeamAName = useCallback((name: string) => {
    dispatch({ type: 'SET_TEAM_A_NAME', payload: name });
  }, []);

  const setTeamBName = useCallback((name: string) => {
    dispatch({ type: 'SET_TEAM_B_NAME', payload: name });
  }, []);

  const resetGame = useCallback(() => {
    dispatch({ type: 'RESET_GAME' });
  }, []);

  const resetMatch = useCallback(() => {
    dispatch({ type: 'RESET_MATCH' });
  }, []);

  const toggleServer = useCallback(() => {
    dispatch({ type: 'TOGGLE_SERVER' });
  }, []);

  const startGame = useCallback(() => {
    dispatch({ type: 'START_GAME' });
  }, []);

  const pauseGame = useCallback(() => {
    dispatch({ type: 'PAUSE_GAME' });
  }, []);

  const setWinningScore = useCallback((score: number) => {
    dispatch({ type: 'SET_WINNING_SCORE', payload: score });
  }, []);

  const setBestOf = useCallback((games: number) => {
    dispatch({ type: 'SET_BEST_OF', payload: games });
  }, []);

  return (
    <GameContext.Provider value={{
      state,
      dispatch,
      incrementTeamA,
      incrementTeamB,
      decrementTeamA,
      decrementTeamB,
      setTeamAName,
      setTeamBName,
      resetGame,
      resetMatch,
      toggleServer,
      startGame,
      pauseGame,
      setWinningScore,
      setBestOf,
    }}>
      {children}
    </GameContext.Provider>
  );
}

export function useGame() {
  const context = useContext(GameContext);
  if (!context) {
    throw new Error('useGame must be used within a GameProvider');
  }
  return context;
}