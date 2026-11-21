from django.test import SimpleTestCase


class RetiredFeatureRouteTests(SimpleTestCase):
    def test_feature_and_api_routes_are_no_longer_exposed(self):
        for path in (
            "/pecuaria/",
            "/pecuaria/api/dashboard/",
            "/pecuaria/api/animais/",
            "/pecuaria/api/producao/",
        ):
            with self.subTest(path=path):
                response = self.client.get(path)
                self.assertEqual(response.status_code, 404)
