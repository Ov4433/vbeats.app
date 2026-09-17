import * as SecureStore from 'expo-secure-store';
import { getToken, storeToken } from '../app/services/tokenService';

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
});
