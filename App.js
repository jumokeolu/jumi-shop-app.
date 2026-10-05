import React, { useEffect, useState } from 'react';
import { View, Text, Button, SafeAreaView, ScrollView, TextInput } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { createClient } from '@supabase/supabase-js';

const API = 'https://jumi-shop.onrender.com';
const redirectTo = Linking.createURL('/');
let sb;

export default function App() {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState(null);
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState({});
  const [msg, setMsg] = useState('Loading...');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');

  const hdr = (s) => ({ 'Content-Type': 'application/json', Authorization: 'Bearer ' + s.access_token });

  useEffect(() => {
    (async () => {
      try {
        const cfg = await (await fetch(API + '/api/config')).json();
        sb = createClient(cfg.url, cfg.anonKey, { auth: { persistSession: false } });
        setProducts(await (await fetch(API + '/api/products')).json());
        setReady(true);
        setMsg('');
      } catch (e) {
        setMsg('Error: ' + e.message);
      }
    })();
  }, []);

  const loadCart = async (s) => {
    const r = await fetch(API + '/api/cart', { headers: hdr(s) });
    if (!r.ok) return;
    const rows = await r.json();
    const c = {};
    rows.forEach((x) => { c[x.product_id] = x.quantity; });
    setCart(c);
  };

  useEffect(() => {
    if (!session) return;
    loadCart(session);
    const ch = sb
      .channel('cart-' + session.user.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cart_items', filter: 'user_id=eq.' + session.user.id }, () => loadCart(session))
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [session]);

  const signIn = async () => {
    try {
      const { data, error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo, skipBrowserRedirect: true } });
      if (error) throw error;
      const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (res.type === 'success') {
        const p = new URLSearchParams(res.url.split('#')[1] || '');
        const { data: d, error: e2 } = await sb.auth.setSession({ access_token: p.get('access_token'), refresh_token: p.get('refresh_token') });
        if (e2) throw e2;
        setSession(d.session);
      }
    } catch (e) {
      setMsg('Login error: ' + e.message);
    }
  };

  const emailLogin = async () => {
    const { data, error } = await sb.auth.signInWithPassword({ email, password: pw });
    if (error) { setMsg('Login error: ' + error.message); return; }
    setSession(data.session);
  };

  const setQty = async (id, q) => {
    setCart((c) => ({ ...c, [id]: q }));
    await fetch(API + '/api/cart', { method: 'PUT', headers: hdr(session), body: JSON.stringify({ product_id: id, quantity: q }) });
  };

  if (!ready) return <SafeAreaView style={{ flex: 1, padding: 24 }}><Text>{msg}</Text></SafeAreaView>;

  if (!session) return (
    <SafeAreaView style={{ flex: 1, padding: 24, justifyContent: 'center' }}>
      <Text style={{ fontSize: 28, fontWeight: 'bold', marginBottom: 16 }}>Jumi</Text>
      <Button title="Sign in with Google" onPress={signIn} />
      <TextInput placeholder="Email" autoCapitalize="none" value={email} onChangeText={setEmail} style={{ borderWidth: 1, padding: 10, marginTop: 16 }} />
      <TextInput placeholder="Password" secureTextEntry value={pw} onChangeText={setPw} style={{ borderWidth: 1, padding: 10, marginVertical: 8 }} />
      <Button title="Sign in with email" onPress={emailLogin} />
      <Text style={{ marginTop: 16, color: 'red' }}>{msg}</Text>
    </SafeAreaView>
  );

  const count = Object.values(cart).reduce((a, b) => a + b, 0);
  return (
    <SafeAreaView style={{ flex: 1, padding: 16 }}>
      <Text style={{ fontSize: 24, fontWeight: 'bold' }}>Jumi (Cart: {count})</Text>
      <ScrollView>
        {products.map((p) => (
          <View key={p.id} style={{ padding: 12, marginVertical: 6, borderWidth: 1, borderRadius: 8 }}>
            <Text style={{ fontSize: 18 }}>{p.name}</Text>
            <Text>₦{(p.price_cents / 100).toLocaleString()}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
              <Button title="-" onPress={() => setQty(p.id, Math.max(0, (cart[p.id] || 0) - 1))} />
              <Text style={{ marginHorizontal: 12 }}>{cart[p.id] || 0}</Text>
              <Button title="+" onPress={() => setQty(p.id, (cart[p.id] || 0) + 1)} />
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
