jest.mock('expo-av', () => ({
  Audio: {
    Sound: {
      createAsync: jest.fn(),
    },
  },
}));

jest.mock('expo-file-system', () => ({
  documentDirectory: 'file:///tmp/',
  getInfoAsync: jest.fn(),
  writeAsStringAsync: jest.fn(),
  readAsStringAsync: jest.fn(),
  deleteAsync: jest.fn(),
}));

jest.mock('expo-status-bar', () => ({
  StatusBar: () => null,
}));
