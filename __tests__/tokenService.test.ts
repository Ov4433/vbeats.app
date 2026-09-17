jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(),
  getItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

import * as SecureStore from 'expo-secure-store';
import { getToken, removeToken, storeToken } from '../app/services/tokenService';

describe('tokenService SecureStore integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('stores token via expo-secure-store', async () => {
    await storeToken('abc');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('vbeats_jwt_token', 'abc');
  });

  it('reads token via expo-secure-store', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('xyz');
    await expect(getToken()).resolves.toBe('xyz');
    expect(SecureStore.getItemAsync).toHaveBeenCalledWith('vbeats_jwt_token');
  });

  it('removes both access and refresh tokens', async () => {
    await removeToken();
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('vbeats_jwt_token');
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('vbeats_refresh_token');
  });
});
