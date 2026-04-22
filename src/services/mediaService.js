import { supabase } from '../lib/supabase'

async function uploadImage(bucket, path, uri, contentType) {
  const response = await fetch(uri)
  const blob = await response.blob()
  const arrayBuffer = await new Response(blob).arrayBuffer()
  const { error } = await supabase.storage.from(bucket).upload(path, arrayBuffer, { contentType, upsert: true })
  if (error) throw error
  const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(path)
  return `${publicUrl}?t=${Date.now()}`
}

async function removeFolder(bucket, folder) {
  const { data: files } = await supabase.storage.from(bucket).list(folder)
  if (files && files.length > 0) {
    const paths = files.map(f => `${folder}/${f.name}`)
    await supabase.storage.from(bucket).remove(paths)
  }
}

export async function uploadAvatar(userId, uri) {
  const ext = uri.split('.').pop()
  const url = await uploadImage('avatars', `${userId}/avatar.${ext}`, uri, `image/${ext}`)
  await supabase.from('profiles').update({ avatar_url: url }).eq('id', userId)
  return url
}

export async function removeAvatar(userId) {
  await removeFolder('avatars', `${userId}`)
  await supabase.from('profiles').update({ avatar_url: null }).eq('id', userId)
}

export async function uploadGroupImage(groupId, uri) {
  const ext = uri.split('.').pop()
  const url = await uploadImage('group-images', `${groupId}/cover.${ext}`, uri, `image/${ext}`)
  await supabase.from('groups').update({ image_url: url }).eq('id', groupId)
  return url
}

export async function removeGroupImage(groupId) {
  await removeFolder('group-images', `${groupId}`)
  await supabase.from('groups').update({ image_url: null }).eq('id', groupId)
}
