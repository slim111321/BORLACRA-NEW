import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity } from 'react-native';
import { CreditCard, Calendar, Lock, User } from 'lucide-react-native';

interface CreditCardFormProps {
  onCardComplete: (cardData: any) => void;
}

export const CreditCardForm: React.FC<CreditCardFormProps> = ({ onCardComplete }) => {
  const [number, setNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvc, setCvc] = useState('');
  const [name, setName] = useState('');
  const [focused, setFocused] = useState<string | null>(null);

  const formatNumber = (text: string) => {
    const cleaned = text.replace(/\D/g, '');
    const groups = cleaned.match(/.{1,4}/g);
    return groups ? groups.join(' ') : cleaned;
  };

  const formatExpiry = (text: string) => {
    const cleaned = text.replace(/\D/g, '');
    if (cleaned.length >= 3) {
      return `${cleaned.slice(0, 2)}/${cleaned.slice(2, 4)}`;
    }
    return cleaned;
  };

  const handleNumberChange = (text: string) => {
    const formatted = formatNumber(text);
    if (formatted.length <= 19) {
      setNumber(formatted);
      if (formatted.length === 19 && expiry.length === 5 && cvc.length >= 3) {
        // Auto-complete simulation
      }
    }
  };

  const handleExpiryChange = (text: string) => {
    const formatted = formatExpiry(text);
    if (formatted.length <= 5) setExpiry(formatted);
  };

  const handleCvcChange = (text: string) => {
    const cleaned = text.replace(/\D/g, '');
    if (cleaned.length <= 4) setCvc(cleaned);
  };

  const handleComplete = async () => {
    if (number.length < 19 || expiry.length < 5 || cvc.length < 3) return;
    
    onCardComplete({
      last4: number.slice(-4),
      expiry,
      name
    });
  };

  return (
    <View style={styles.cardContainer}>
      <Text style={styles.label}>Cardholder Name</Text>
      <View style={[styles.inputWrapper, focused === 'name' && styles.inputWrapperFocused]}>
        <User size={18} color={focused === 'name' ? '#4F46E5' : '#9CA3AF'} />
        <TextInput
          style={styles.input}
          placeholder="Name on card"
          placeholderTextColor="#9CA3AF"
          value={name}
          onChangeText={setName}
          onFocus={() => setFocused('name')}
          onBlur={() => setFocused(null)}
        />
      </View>

      <Text style={styles.label}>Card Number</Text>
      <View style={[styles.inputWrapper, focused === 'number' && styles.inputWrapperFocused]}>
        <CreditCard size={18} color={focused === 'number' ? '#4F46E5' : '#9CA3AF'} />
        <TextInput
          style={styles.input}
          placeholder="0000 0000 0000 0000"
          placeholderTextColor="#9CA3AF"
          keyboardType="numeric"
          value={number}
          onChangeText={handleNumberChange}
          onFocus={() => setFocused('number')}
          onBlur={() => setFocused(null)}
        />
        {number.length > 0 && (
          <Text style={styles.cardType}>VISA</Text>
        )}
      </View>

      <View style={styles.row}>
        <View style={{ flex: 1, marginRight: 10 }}>
          <Text style={styles.label}>Expiry Date</Text>
          <View style={[styles.inputWrapper, focused === 'expiry' && styles.inputWrapperFocused]}>
            <Calendar size={18} color={focused === 'expiry' ? '#4F46E5' : '#9CA3AF'} />
            <TextInput
              style={styles.input}
              placeholder="MM/YY"
              placeholderTextColor="#9CA3AF"
              keyboardType="numeric"
              value={expiry}
              onChangeText={handleExpiryChange}
              onFocus={() => setFocused('expiry')}
              onBlur={() => setFocused(null)}
            />
          </View>
        </View>

        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={styles.label}>CVC</Text>
          <View style={[styles.inputWrapper, focused === 'cvc' && styles.inputWrapperFocused]}>
            <Lock size={18} color={focused === 'cvc' ? '#4F46E5' : '#9CA3AF'} />
            <TextInput
              style={styles.input}
              placeholder="123"
              placeholderTextColor="#9CA3AF"
              keyboardType="numeric"
              secureTextEntry
              value={cvc}
              onChangeText={handleCvcChange}
              onFocus={() => setFocused('cvc')}
              onBlur={() => setFocused(null)}
            />
          </View>
        </View>
      </View>

      <TouchableOpacity 
        style={styles.completeBtn} 
        onPress={handleComplete}
      >
        <Text style={styles.completeBtnText}>Confirm Card Details</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  cardContainer: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    borderWidth: 1,
    borderColor: '#F3F4F6',
    marginVertical: 10,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingHorizontal: 12,
    marginBottom: 16,
    height: 50,
    backgroundColor: '#fff',
  },
  inputWrapperFocused: {
    borderColor: '#4F46E5',
    backgroundColor: '#fff',
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  input: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    color: '#1F2937',
    marginLeft: 10,
  },
  row: {
    flexDirection: 'row',
  },
  cardType: {
    fontSize: 10,
    fontWeight: '900',
    color: '#4F46E5',
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  completeBtn: {
    backgroundColor: '#4F46E5',
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 20,
  },
  completeBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  }
});
