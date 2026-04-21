from tests.helpers.db_mocks import make_mock_connection


class TestDbMocks:
    def test_fetchone_by_sql_returns_none_after_queue_is_exhausted(self):
        conn, cursor = make_mock_connection(
            fetchone_by_sql={"select id from conversations": [("conv-1",)]}
        )

        with conn.cursor() as cur:
            cur.execute("SELECT id FROM conversations WHERE user_id = %s", ("u1",))
            first = cur.fetchone()
            second = cur.fetchone()

        assert first == ("conv-1",)
        assert second is None
