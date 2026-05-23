<template>
  <Dashboard />
  <NotificationContainer />
</template>

<script>
import Dashboard from './pages/Dashboard.vue';
import NotificationContainer from './components/NotificationContainer.vue';

export default {
  name: 'App',
  components: {
    Dashboard,
    NotificationContainer
  }
};
</script>
