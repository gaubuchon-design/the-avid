import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet } from 'react-native';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: '#1e293b' },
            headerTintColor: '#f1f5f9',
            headerTitleStyle: { fontWeight: '600' },
            contentStyle: { backgroundColor: '#0f172a' },
          }}
        >
          <Stack.Screen name="index" options={{ title: 'Media Composer Unified' }} />
          <Stack.Screen name="editor/[projectId]" options={{ title: 'Editor', headerBackTitle: 'Projects' }} />
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
