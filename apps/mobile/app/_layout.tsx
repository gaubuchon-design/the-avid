import React, { useCallback, useEffect, useState, type ReactNode, type ErrorInfo, Component } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet, View, Text, ActivityIndicator, LogBox } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';

// Suppress known warnings from dependencies in development
LogBox.ignoreLogs([
  'Non-serializable values were found in the navigation state',
]);

// Keep splash visible until layout is ready
SplashScreen.preventAutoHideAsync().catch(() => {
  // Already hidden or not available
});

/**
 * Minimal error boundary for React Native.
 * Class components are required for getDerivedStateFromError.
 */
interface ErrorBoundaryState {
  error: Error | null;
}

class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <View style={errorStyles.container}>
          <Text style={errorStyles.title}>Something went wrong</Text>
          <Text style={errorStyles.message}>{this.state.error.message}</Text>
          <Text
            style={errorStyles.retry}
            onPress={() => this.setState({ error: null })}
          >
            Tap to retry
          </Text>
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
    marginBottom: 24,
    lineHeight: 20,
  },
  retry: {
    color: '#818cf8',
    fontSize: 16,
    fontWeight: '600',
  },
});

// ─── Root Layout ──────────────────────────────────────────────────────────────

export default function RootLayout() {
  const [appReady, setAppReady] = useState(false);

  useEffect(() => {
    // Perform any async initialisation (font loading, store hydration, etc.)
    async function prepare() {
      try {
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
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={styles.root} onLayout={onLayoutReady}>
        <SafeAreaProvider>
          <StatusBar style="light" />
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: '#1e293b' },
              headerTintColor: '#f1f5f9',
              headerTitleStyle: { fontWeight: '600' },
              contentStyle: { backgroundColor: '#0f172a' },
              animation: 'slide_from_right',
            }}
          >
            <Stack.Screen
              name="index"
              options={{ title: 'The Avid', headerLargeTitle: true }}
            />
            <Stack.Screen
              name="editor/[projectId]"
              options={{
                title: 'Editor',
                headerBackTitle: 'Projects',
                gestureEnabled: true,
              }}
            />
          </Stack>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  loading: {
    flex: 1,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
