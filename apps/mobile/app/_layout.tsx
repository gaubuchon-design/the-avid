import React, {
  useCallback,
  useEffect,
  useState,
  createContext,
  useContext,
  useMemo,
  type ReactNode,
  type ErrorInfo,
  Component,
} from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import {
  StyleSheet,
  View,
  Text,
  ActivityIndicator,
  LogBox,
  Platform,
  Pressable,
  useColorScheme,
  AccessibilityInfo,
} from 'react-native';
import * as SplashScreen from 'expo-splash-screen';

// ---------------------------------------------------------------------------
// Suppress known warnings from dependencies in development
// ---------------------------------------------------------------------------
LogBox.ignoreLogs([
  'Non-serializable values were found in the navigation state',
]);

// Keep splash visible until layout is ready
SplashScreen.preventAutoHideAsync().catch(() => {
  // Already hidden or not available
});

// ---------------------------------------------------------------------------
// Theme system
// ---------------------------------------------------------------------------

/** Design tokens shared by the whole app. */
export interface AppTheme {
  dark: boolean;
  colors: {
    background: string;
    surface: string;
    surfaceAlt: string;
    border: string;
    text: string;
    textSecondary: string;
    textMuted: string;
    primary: string;
    primaryContainer: string;
    error: string;
    errorContainer: string;
    success: string;
    warning: string;
    /** Tab bar tint color for active icon */
    tabActive: string;
    /** Tab bar tint color for inactive icon */
    tabInactive: string;
  };
}

const DARK_THEME: AppTheme = {
  dark: true,
  colors: {
    background: '#0f172a',
    surface: '#1e293b',
    surfaceAlt: '#161f2e',
    border: '#334155',
    text: '#f1f5f9',
    textSecondary: '#94a3b8',
    textMuted: '#64748b',
    primary: '#6366f1',
    primaryContainer: '#312e81',
    error: '#f87171',
    errorContainer: '#7f1d1d',
    success: '#4ade80',
    warning: '#f59e0b',
    tabActive: '#6366f1',
    tabInactive: '#64748b',
  },
};

const LIGHT_THEME: AppTheme = {
  dark: false,
  colors: {
    background: '#f8fafc',
    surface: '#ffffff',
    surfaceAlt: '#f1f5f9',
    border: '#e2e8f0',
    text: '#0f172a',
    textSecondary: '#475569',
    textMuted: '#94a3b8',
    primary: '#6366f1',
    primaryContainer: '#e0e7ff',
    error: '#dc2626',
    errorContainer: '#fee2e2',
    success: '#16a34a',
    warning: '#d97706',
    tabActive: '#6366f1',
    tabInactive: '#94a3b8',
  },
};

const ThemeContext = createContext<AppTheme>(DARK_THEME);

/** Hook to access the current theme tokens. */
export function useAppTheme(): AppTheme {
  return useContext(ThemeContext);
}

function ThemeProvider({ children }: { children: ReactNode }) {
  // NLE apps overwhelmingly use dark UI; honour system preference but default dark.
  const systemScheme = useColorScheme();
  const theme = useMemo(
    () => (systemScheme === 'light' ? LIGHT_THEME : DARK_THEME),
    [systemScheme],
  );

  return (
    <ThemeContext.Provider value={theme}>
      {children}
    </ThemeContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Reduce Motion context
// ---------------------------------------------------------------------------

const ReduceMotionContext = createContext<boolean>(false);

export function useReduceMotion(): boolean {
  return useContext(ReduceMotionContext);
}

// ---------------------------------------------------------------------------
// Authentication context (lightweight; no external auth library required)
// ---------------------------------------------------------------------------

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  signInDemo: () => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  signInDemo: () => {},
  signOut: () => {},
});

/** Hook to access the current auth state. */
export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}

/**
 * Provider that gates the app behind authentication.
 * Ships with a "demo mode" sign-in so the app is usable offline.
 * Replace the demo flow with a real OAuth / token-based flow before release.
 */
function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Simulate checking persisted session (e.g. SecureStore)
    const timer = setTimeout(() => {
      // Auto-sign-in as demo user for now (replace with real session restore)
      setUser({
        id: 'demo-user',
        email: 'demo@theavid.app',
        displayName: 'Demo User',
      });
      setIsLoading(false);
    }, 300);
    return () => clearTimeout(timer);
  }, []);

  const signInDemo = useCallback(() => {
    setUser({
      id: 'demo-user',
      email: 'demo@theavid.app',
      displayName: 'Demo User',
    });
  }, []);

  const signOut = useCallback(() => {
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: user !== null,
      isLoading,
      signInDemo,
      signOut,
    }),
    [user, isLoading, signInDemo, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ---------------------------------------------------------------------------
// Auth gate -- shown when the user is not authenticated
// ---------------------------------------------------------------------------

function AuthGate() {
  const { signInDemo } = useAuth();
  const theme = useAppTheme();

  return (
    <View
      style={[authStyles.container, { backgroundColor: theme.colors.background }]}
      accessibilityRole="header"
    >
      <View style={[authStyles.logoCircle, { backgroundColor: theme.colors.primaryContainer }]}>
        <Text style={[authStyles.logoText, { color: theme.colors.primary }]}>A</Text>
      </View>
      <Text style={[authStyles.title, { color: theme.colors.text }]}>
        The Avid
      </Text>
      <Text style={[authStyles.subtitle, { color: theme.colors.textSecondary }]}>
        AI-powered NLE companion for mobile review and rough-cut editing
      </Text>
      <Pressable
        onPress={signInDemo}
        style={({ pressed }) => [
          authStyles.signInBtn,
          { backgroundColor: theme.colors.primary, opacity: pressed ? 0.8 : 1 },
        ]}
        accessibilityRole="button"
        accessibilityLabel="Sign in as demo user"
      >
        <Text style={authStyles.signInBtnText}>Continue as Demo User</Text>
      </Pressable>
      <Text style={[authStyles.footnote, { color: theme.colors.textMuted }]}>
        Replace with SSO or OAuth for production
      </Text>
    </View>
  );
}

const authStyles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 12,
  },
  logoCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  logoText: {
    fontSize: 36,
    fontWeight: '800',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 300,
    marginBottom: 24,
  },
  signInBtn: {
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 10,
    minWidth: 220,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  signInBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  footnote: {
    fontSize: 11,
    marginTop: 16,
  },
});

// ---------------------------------------------------------------------------
// Error boundary
// ---------------------------------------------------------------------------

interface ErrorBoundaryState {
  error: Error | null;
}

interface ErrorBoundaryProps {
  children: ReactNode;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // In production, send to Sentry / Bugsnag here
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  private handleRetry = () => {
    this.setState({ error: null });
  };

  override render(): ReactNode {
    if (this.state.error) {
      return (
        <View style={errorStyles.container} accessibilityRole="alert">
          <View style={errorStyles.iconCircle}>
            <Text style={errorStyles.iconText}>!</Text>
          </View>
          <Text style={errorStyles.title}>Something went wrong</Text>
          <Text
            style={errorStyles.message}
            accessibilityLabel={`Error: ${this.state.error.message}`}
          >
            {this.state.error.message}
          </Text>
          {__DEV__ && this.state.error.stack ? (
            <Text style={errorStyles.stack} numberOfLines={6}>
              {this.state.error.stack}
            </Text>
          ) : null}
          <Pressable
            onPress={this.handleRetry}
            style={({ pressed }) => [
              errorStyles.retryBtn,
              { opacity: pressed ? 0.7 : 1 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Retry after error"
          >
            <Text style={errorStyles.retryText}>Tap to retry</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}

const errorStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#7f1d1d',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  iconText: {
    color: '#f87171',
    fontSize: 28,
    fontWeight: '800',
  },
  title: {
    color: '#f1f5f9',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 12,
  },
  message: {
    color: '#94a3b8',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 20,
  },
  stack: {
    color: '#64748b',
    fontSize: 10,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    textAlign: 'left',
    marginBottom: 24,
    maxWidth: '100%',
    lineHeight: 14,
  },
  retryBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#312e81',
    minHeight: 44,
    justifyContent: 'center',
  },
  retryText: {
    color: '#818cf8',
    fontSize: 16,
    fontWeight: '600',
  },
});

// ---------------------------------------------------------------------------
// Root Layout
// ---------------------------------------------------------------------------

export default function RootLayout() {
  const [appReady, setAppReady] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    async function prepare() {
      try {
        // Check accessibility preferences
        const motionPref = await AccessibilityInfo.isReduceMotionEnabled();
        setReduceMotion(motionPref);

        // Future: load custom fonts with expo-font here
        // await Font.loadAsync({ ... });
      } catch (error) {
        console.warn('Startup preparation error:', error);
      } finally {
        setAppReady(true);
      }
    }
    void prepare();
  }, []);

  const onLayoutReady = useCallback(async () => {
    if (appReady) {
      await SplashScreen.hideAsync();
    }
  }, [appReady]);

  if (!appReady) {
    return (
      <View style={styles.loading} accessibilityRole="progressbar" accessibilityLabel="Loading application">
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <ReduceMotionContext.Provider value={reduceMotion}>
          <AuthProvider>
            <RootNavigator reduceMotion={reduceMotion} onLayoutReady={onLayoutReady} />
          </AuthProvider>
        </ReduceMotionContext.Provider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

// ---------------------------------------------------------------------------
// Root navigator (split out so it can consume auth + theme contexts)
// ---------------------------------------------------------------------------

interface RootNavigatorProps {
  reduceMotion: boolean;
  onLayoutReady: () => void;
}

function RootNavigator({ reduceMotion, onLayoutReady }: RootNavigatorProps) {
  const { isAuthenticated, isLoading } = useAuth();
  const theme = useAppTheme();

  if (isLoading) {
    return (
      <View
        style={[styles.loading, { backgroundColor: theme.colors.background }]}
        accessibilityRole="progressbar"
        accessibilityLabel="Checking authentication"
      >
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  if (!isAuthenticated) {
    return (
      <GestureHandlerRootView style={styles.root} onLayout={onLayoutReady}>
        <SafeAreaProvider>
          <StatusBar style={theme.dark ? 'light' : 'dark'} />
          <AuthGate />
        </SafeAreaProvider>
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={styles.root} onLayout={onLayoutReady}>
      <SafeAreaProvider>
        <StatusBar style={theme.dark ? 'light' : 'dark'} />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: theme.colors.surface },
            headerTintColor: theme.colors.text,
            headerTitleStyle: { fontWeight: '600' },
            contentStyle: { backgroundColor: theme.colors.background },
            animation: reduceMotion ? 'none' : 'slide_from_right',
          }}
        >
          <Stack.Screen
            name="(tabs)"
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="editor/[projectId]"
            options={{
              title: 'Editor',
              headerBackTitle: 'Projects',
              gestureEnabled: true,
              presentation: 'card',
            }}
          />
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: { flex: 1 },
  loading: {
    flex: 1,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
