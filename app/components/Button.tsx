import { TouchableOpacity, Text, StyleSheet, ViewStyle } from 'react-native';

interface ButtonProps {
  onPress: () => void;
  title: string;
  style?: ViewStyle;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
}

export default function Button({ onPress, title, style, variant = 'primary', disabled = false }: ButtonProps) {
  return (
    <TouchableOpacity
      disabled={disabled}
      style={[
        styles.button,
        variant === 'secondary' && styles.buttonSecondary,
        disabled && styles.buttonDisabled,
        style,
      ]}
      onPress={onPress}
    >
      <Text
        style={[
          styles.text,
          variant === 'secondary' && styles.textSecondary,
        ]}
      >
        {title}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: '#ff3d9a',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#ff3d9a',
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  text: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  textSecondary: {
    color: '#ff3d9a',
  },
});