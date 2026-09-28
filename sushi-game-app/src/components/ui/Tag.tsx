import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { fonts, radii } from '../../theme/theme';

interface TagProps {
  label: string;
  color: string;
  background: string;
  kanji?: string;
}

const Tag: React.FC<TagProps> = ({ label, color, background, kanji }) => (
  <View style={[styles.tag, { backgroundColor: background }]}>
    {kanji ? <Text style={[styles.kanji, { color }]}>{kanji}</Text> : null}
    <Text style={[styles.label, { color }]}>{label}</Text>
  </View>
);

const styles = StyleSheet.create({
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: radii.pill,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  kanji: {
    fontSize: 11,
    fontWeight: '700',
  },
  label: {
    fontFamily: fonts.semibold,
    fontSize: 11.5,
  },
});

export default Tag;
