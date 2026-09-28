from unittest import IsolatedAsyncioTestCase
from unittest.mock import AsyncMock, MagicMock

from sqlalchemy.exc import IntegrityError

from app.common.middleware.auth import DEV_USER_EMAIL, _get_or_create_dev_user
from app.models.user import User


class GetOrCreateDevUserTests(IsolatedAsyncioTestCase):
    async def test_concurrent_creation_recovers_existing_user(self) -> None:
        existing_user = User(
            id="existing-user-id",
            email=DEV_USER_EMAIL,
            passwordHash="",
            displayName="Dev User",
        )
        db = MagicMock()
        db.execute = AsyncMock(
            side_effect=[
                MagicMock(scalar_one_or_none=MagicMock(return_value=None)),
                MagicMock(scalar_one_or_none=MagicMock(return_value=existing_user)),
            ]
        )
        db.commit = AsyncMock(side_effect=IntegrityError("insert", {}, Exception("duplicate")))
        db.rollback = AsyncMock()

        user = await _get_or_create_dev_user(db)

        self.assertIs(user, existing_user)
        db.rollback.assert_awaited_once()
        self.assertEqual(db.execute.await_count, 2)