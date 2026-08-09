jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));

import * as SecureStore from 'expo-secure-store';
import { getBalanceVisibility, setBalanceVisibility } from '../src/services/balanceVisibility';

const mockGet = SecureStore.getItemAsync as jest.Mock;
const mockSet = SecureStore.setItemAsync as jest.Mock;

describe('balanceVisibility', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('defaults to visible (true) when no preference stored (first install)', async () => {
    mockGet.mockResolvedValue(null);
    expect(await getBalanceVisibility()).toBe(true);
  });

  it('returns false when stored value is "hidden"', async () => {
    mockGet.mockResolvedValue('hidden');
    expect(await getBalanceVisibility()).toBe(false);
  });

  it('returns true when stored value is "visible"', async () => {
    mockGet.mockResolvedValue('visible');
    expect(await getBalanceVisibility()).toBe(true);
  });

  it('stores "hidden" when setBalanceVisibility(false) is called', async () => {
    mockSet.mockResolvedValue(undefined);
    await setBalanceVisibility(false);
    expect(mockSet).toHaveBeenCalledWith('balance_visibility', 'hidden');
  });

  it('stores "visible" when setBalanceVisibility(true) is called', async () => {
    mockSet.mockResolvedValue(undefined);
    await setBalanceVisibility(true);
    expect(mockSet).toHaveBeenCalledWith('balance_visibility', 'visible');
  });
});
